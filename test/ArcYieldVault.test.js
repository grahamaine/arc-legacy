const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const YEAR = 365 * 24 * 60 * 60;

describe("ArcYieldVault", function () {
  let vault, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    vault = await ethers.deployContract("ArcYieldVault", [500]); // 5% APY
  });

  async function fund(amount) {
    await vault.fundReserve({ value: ethers.parseEther(amount) });
  }

  it("records supplied principal and total", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    const [principal] = await vault.positionOf(alice.address);
    expect(principal).to.equal(ethers.parseEther("100"));
    expect(await vault.totalPrincipal()).to.equal(ethers.parseEther("100"));
  });

  it("accrues ~5% simple interest over a year", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    await time.increase(YEAR);
    const [, accrued] = await vault.positionOf(alice.address);
    // ~5 USDC, small slack for the extra second of block time.
    expect(accrued).to.be.gt(ethers.parseEther("4.99"));
    expect(accrued).to.be.lt(ethers.parseEther("5.01"));
  });

  it("pays interest out of the reserve, never principal", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    await time.increase(YEAR);
    await fund("10"); // seed reserve
    await expect(
      vault.connect(alice).claimInterest()
    ).to.changeEtherBalance(alice, (v) => v > ethers.parseEther("4.9"));
    // principal still fully intact and withdrawable
    const [principal] = await vault.positionOf(alice.address);
    expect(principal).to.equal(ethers.parseEther("100"));
  });

  it("reverts interest claim when the reserve is empty", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    await time.increase(YEAR);
    // no reserve funded → balance == totalPrincipal, nothing to pay from
    await expect(
      vault.connect(alice).claimInterest()
    ).to.be.revertedWithCustomError(vault, "InsufficientReserve");
  });

  it("keeps principal fully withdrawable", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    await time.increase(YEAR / 2);
    await expect(
      vault.connect(alice).withdraw(ethers.parseEther("100"))
    ).to.changeEtherBalance(alice, ethers.parseEther("100"));
    // interest still banked after full principal withdrawal
    const [principal, accrued] = await vault.positionOf(alice.address);
    expect(principal).to.equal(0);
    expect(accrued).to.be.gt(0);
  });

  it("never lets one user's interest touch another's principal", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    await vault.connect(bob).supply({ value: ethers.parseEther("50") });
    await time.increase(YEAR);
    // No reserve: alice cannot drain toward bob's principal.
    await expect(
      vault.connect(alice).claimInterest()
    ).to.be.revertedWithCustomError(vault, "InsufficientReserve");
    // Bob's principal remains fully backed.
    expect(await vault.totalPrincipal()).to.equal(ethers.parseEther("150"));
    expect(await ethers.provider.getBalance(vault.target)).to.equal(
      ethers.parseEther("150")
    );
  });

  it("caps the rate and gates setRate to the owner", async function () {
    await expect(
      ethers.deployContract("ArcYieldVault", [2001])
    ).to.be.revertedWithCustomError(vault, "RateTooHigh");
    await expect(
      vault.connect(alice).setRate(100)
    ).to.be.revertedWithCustomError(vault, "NotOwner");
    await vault.setRate(800);
    expect(await vault.rateBps()).to.equal(800);
  });

  it("reports reserve as balance above total principal", async function () {
    await vault.connect(alice).supply({ value: ethers.parseEther("100") });
    expect(await vault.reserve()).to.equal(0);
    await fund("7");
    expect(await vault.reserve()).to.equal(ethers.parseEther("7"));
  });
});
