const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY;

describe("ArcLegacyV2", function () {
  let legacy, owner, heir1, heir2, g1, g2, g3, stranger;

  beforeEach(async function () {
    [owner, heir1, heir2, g1, g2, g3, stranger] = await ethers.getSigners();
    legacy = await ethers.deployContract("ArcLegacyV2");
  });

  async function setupEstate(depositEth = "100", shares = [7000, 3000]) {
    await legacy.deposit({ value: ethers.parseEther(depositEth) });
    await legacy.setBeneficiaries([heir1.address, heir2.address], shares);
  }

  // ------------------------------------------------------- v1 baseline still works

  describe("core estate (v1 parity)", function () {
    it("accepts deposits and defaults the interval", async function () {
      await legacy.deposit({ value: ethers.parseEther("5") });
      const e = await legacy.getEstate(owner.address);
      expect(e.balance).to.equal(ethers.parseEther("5"));
      expect(e.checkInInterval).to.equal(30 * DAY);
      expect(e.vestingDuration).to.equal(0);
    });

    it("blocks owner actions once unlocked", async function () {
      await setupEstate();
      await legacy.setCheckInInterval(DAY);
      await time.increase(2 * DAY);
      await legacy.connect(heir1).claim(owner.address); // unlocks
      await expect(legacy.checkIn()).to.be.revertedWithCustomError(
        legacy,
        "EstateIsUnlocked"
      );
    });

    it("pays a lump sum when vesting is 0", async function () {
      await setupEstate("100");
      await legacy.setCheckInInterval(DAY);
      await time.increase(2 * DAY);
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.changeEtherBalance(heir1, ethers.parseEther("70"));
      // second claim has nothing left to give
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.be.revertedWithCustomError(legacy, "NothingToClaim");
    });
  });

  // ------------------------------------------------------- vesting / streaming

  describe("linear vesting", function () {
    beforeEach(async function () {
      await setupEstate("100");
      await legacy.setVesting(YEAR); // heir1 (70) streams over a year
      await legacy.setCheckInInterval(DAY);
      await time.increase(2 * DAY); // past deadline
    });

    it("releases nothing meaningful immediately, then streams", async function () {
      // Deadline passed but not yet unlocked → claimable ~0.
      const before = await legacy.claimable(owner.address, heir1.address);
      expect(before).to.equal(0);

      await legacy.triggerUnlock(owner.address); // start the clock @ ~t0
      // Roughly a quarter of the year in.
      await time.increase(YEAR / 4);
      const c = await legacy.claimable(owner.address, heir1.address);
      // ~25% of 70 = ~17.5; allow slack for block timing.
      expect(c).to.be.gt(ethers.parseEther("17"));
      expect(c).to.be.lt(ethers.parseEther("18.5"));
    });

    it("allows repeated partial claims that sum to the full share", async function () {
      await legacy.triggerUnlock(owner.address); // unlock @ t0
      await time.increase(YEAR / 2);
      await legacy.connect(heir1).claim(owner.address); // ~half
      await time.increase(YEAR); // well past end
      await legacy.connect(heir1).claim(owner.address); // remainder

      const paid = await legacy.claimedOf(owner.address, heir1.address);
      expect(paid).to.equal(ethers.parseEther("70"));
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.be.revertedWithCustomError(legacy, "NothingToClaim");
    });

    it("caps vested at the full entitlement after the window", async function () {
      await legacy.triggerUnlock(owner.address);
      await time.increase(YEAR * 3);
      const c = await legacy.claimable(owner.address, heir1.address);
      const paid = await legacy.claimedOf(owner.address, heir1.address);
      expect(c + paid).to.equal(ethers.parseEther("70"));
    });

    it("rejects a vesting window longer than the max", async function () {
      await expect(
        legacy.setVesting(3651 * DAY)
      ).to.be.revertedWithCustomError(legacy, "VestingTooLong");
    });
  });

  // ------------------------------------------------------- guardians (M-of-N)

  describe("guardian attestation", function () {
    beforeEach(async function () {
      await setupEstate("100");
      await legacy.setGuardians([g1.address, g2.address, g3.address], 2);
    });

    it("stores the roster and threshold", async function () {
      const [guardians, threshold, attested] = await legacy.getGuardians(
        owner.address
      );
      expect(guardians.length).to.equal(3);
      expect(threshold).to.equal(2);
      expect(attested).to.equal(0);
    });

    it("unlocks once the threshold of guardians attest", async function () {
      await legacy.connect(g1).attestUnlock(owner.address);
      let e = await legacy.getEstate(owner.address);
      expect(e.unlocked).to.equal(false);

      await legacy.connect(g2).attestUnlock(owner.address);
      e = await legacy.getEstate(owner.address);
      expect(e.unlocked).to.equal(true);
      expect(e.unlockedBalance).to.equal(ethers.parseEther("100"));
    });

    it("lets heirs claim after a guardian unlock, before any deadline", async function () {
      await legacy.connect(g1).attestUnlock(owner.address);
      await legacy.connect(g2).attestUnlock(owner.address);
      await expect(
        legacy.connect(heir1).claim(owner.address)
      ).to.changeEtherBalance(heir1, ethers.parseEther("70"));
    });

    it("rejects attestation from a non-guardian", async function () {
      await expect(
        legacy.connect(stranger).attestUnlock(owner.address)
      ).to.be.revertedWithCustomError(legacy, "NotAGuardian");
    });

    it("clears attestations on owner check-in (false alarm)", async function () {
      await legacy.connect(g1).attestUnlock(owner.address);
      let [, , attested] = await legacy.getGuardians(owner.address);
      expect(attested).to.equal(1);

      await legacy.checkIn(); // proof of life
      [, , attested] = await legacy.getGuardians(owner.address);
      expect(attested).to.equal(0);

      // g1's stale attestation no longer counts; needs two fresh ones again.
      await legacy.connect(g2).attestUnlock(owner.address);
      const e = await legacy.getEstate(owner.address);
      expect(e.unlocked).to.equal(false);
    });

    it("counts each guardian once even if they attest twice", async function () {
      await legacy.connect(g1).attestUnlock(owner.address);
      await legacy.connect(g1).attestUnlock(owner.address);
      const [, , attested] = await legacy.getGuardians(owner.address);
      expect(attested).to.equal(1);
    });

    it("rejects a threshold above the guardian count", async function () {
      await expect(
        legacy.setGuardians([g1.address], 2)
      ).to.be.revertedWithCustomError(legacy, "InvalidThreshold");
    });

    it("rejects duplicate guardians and the owner as guardian", async function () {
      await expect(
        legacy.setGuardians([g1.address, g1.address], 1)
      ).to.be.revertedWithCustomError(legacy, "DuplicateGuardian");
      await expect(
        legacy.setGuardians([owner.address], 1)
      ).to.be.revertedWithCustomError(legacy, "ZeroAddress");
    });

    it("can be disabled with an empty roster", async function () {
      await legacy.setGuardians([], 0);
      const [guardians, threshold] = await legacy.getGuardians(owner.address);
      expect(guardians.length).to.equal(0);
      expect(threshold).to.equal(0);
      await expect(
        legacy.connect(g1).attestUnlock(owner.address)
      ).to.be.revertedWithCustomError(legacy, "NotAGuardian");
    });
  });

  // ------------------------------------------------------- combined scenario

  it("guardian unlock + vesting stream end to end", async function () {
    await setupEstate("100"); // heir1 70%, heir2 30%
    await legacy.setVesting(YEAR);
    await legacy.setGuardians([g1.address, g2.address], 2);

    // Guardians unlock the estate immediately, no deadline wait.
    await legacy.connect(g1).attestUnlock(owner.address);
    await legacy.connect(g2).attestUnlock(owner.address);
    expect((await legacy.getEstate(owner.address)).unlocked).to.equal(true);

    // Halfway through the year, heir2 (30) has ~15 available.
    await time.increase(YEAR / 2);
    const c = await legacy.claimable(owner.address, heir2.address);
    expect(c).to.be.gt(ethers.parseEther("14.9"));
    expect(c).to.be.lt(ethers.parseEther("15.1"));

    // After the full window both heirs can drain their entire shares.
    await time.increase(YEAR);
    await legacy.connect(heir1).claim(owner.address);
    await legacy.connect(heir2).claim(owner.address);
    expect(await legacy.claimedOf(owner.address, heir1.address)).to.equal(
      ethers.parseEther("70")
    );
    expect(await legacy.claimedOf(owner.address, heir2.address)).to.equal(
      ethers.parseEther("30")
    );
  });
});
