const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;
const BPS = 10_000n;

describe("ArcLegacy", function () {
  let legacy, owner, heir1, heir2, stranger;

  beforeEach(async function () {
    [owner, heir1, heir2, stranger] = await ethers.getSigners();
    legacy = await ethers.deployContract("ArcLegacy");
  });

  async function setupEstate(depositEth = "100") {
    await legacy.deposit({ value: ethers.parseEther(depositEth) });
    await legacy.setBeneficiaries(
      [heir1.address, heir2.address],
      [7000, 3000]
    );
  }

  describe("deposits and withdrawals", function () {
    it("accepts deposits and tracks balance", async function () {
      await legacy.deposit({ value: ethers.parseEther("5") });
      const estate = await legacy.getEstate(owner.address);
      expect(estate.balance).to.equal(ethers.parseEther("5"));
      expect(estate.checkInInterval).to.equal(30 * DAY);
    });

    it("rejects zero-value deposits", async function () {
      await expect(legacy.deposit({ value: 0 })).to.be.revertedWithCustomError(
        legacy,
        "ZeroAmount"
      );
    });

    it("lets the owner withdraw while locked", async function () {
      await legacy.deposit({ value: ethers.parseEther("5") });
      await expect(
        legacy.withdraw(ethers.parseEther("2"))
      ).to.changeEtherBalance(owner, ethers.parseEther("2"));
      const estate = await legacy.getEstate(owner.address);
      expect(estate.balance).to.equal(ethers.parseEther("3"));
    });

    it("rejects overdrawn withdrawals", async function () {
      await legacy.deposit({ value: ethers.parseEther("1") });
      await expect(
        legacy.withdraw(ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(legacy, "InsufficientBalance");
    });
  });

  describe("beneficiaries", function () {
    it("stores a valid beneficiary list", async function () {
      await setupEstate();
      const estate = await legacy.getEstate(owner.address);
      expect(estate.beneficiaries.length).to.equal(2);
      expect(estate.beneficiaries[0].shareBps).to.equal(7000);
    });

    it("rejects shares that do not sum to 10000", async function () {
      await expect(
        legacy.setBeneficiaries([heir1.address], [9999])
      ).to.be.revertedWithCustomError(legacy, "SharesMustSumTo10000");
    });

    it("rejects duplicate beneficiaries", async function () {
      await expect(
        legacy.setBeneficiaries(
          [heir1.address, heir1.address],
          [5000, 5000]
        )
      ).to.be.revertedWithCustomError(legacy, "DuplicateBeneficiary");
    });
  });

  describe("dead-man's-switch", function () {
    it("is not claimable while the owner checks in", async function () {
      await setupEstate();
      expect(await legacy.isClaimable(owner.address)).to.equal(false);

      await time.increase(29 * DAY);
      await legacy.checkIn();
      await time.increase(29 * DAY);
      expect(await legacy.isClaimable(owner.address)).to.equal(false);
    });

    it("becomes claimable after the deadline lapses", async function () {
      await setupEstate();
      await time.increase(31 * DAY);
      expect(await legacy.isClaimable(owner.address)).to.equal(true);
    });

    it("blocks claims before the deadline", async function () {
      await setupEstate();
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.be.revertedWithCustomError(legacy, "EstateNotClaimable");
    });
  });

  describe("claims", function () {
    beforeEach(async function () {
      await setupEstate("100");
      await time.increase(31 * DAY);
    });

    it("pays each beneficiary their share", async function () {
      const total = ethers.parseEther("100");
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.changeEtherBalance(heir1, (total * 7000n) / BPS);
      await expect(
        legacy.connect(heir2).claim(owner.address)
      ).to.changeEtherBalance(heir2, (total * 3000n) / BPS);
    });

    it("blocks double claims", async function () {
      await legacy.connect(heir1).claim(owner.address);
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.be.revertedWithCustomError(legacy, "AlreadyClaimed");
    });

    it("blocks non-beneficiaries", async function () {
      await expect(
        legacy.connect(stranger).claim(owner.address)
      ).to.be.revertedWithCustomError(legacy, "NotABeneficiary");
    });

    it("freezes owner actions once unlocked", async function () {
      await legacy.connect(heir1).claim(owner.address);
      await expect(
        legacy.deposit({ value: 1 })
      ).to.be.revertedWithCustomError(legacy, "EstateIsUnlocked");
      await expect(legacy.checkIn()).to.be.revertedWithCustomError(
        legacy,
        "EstateIsUnlocked"
      );
      await expect(
        legacy.withdraw(1)
      ).to.be.revertedWithCustomError(legacy, "EstateIsUnlocked");
    });
  });
});
