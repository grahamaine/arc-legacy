const { expect } = require("chai");
const { ethers } = require("hardhat");

const REF = ethers.encodeBytes32String("invoice-1");
const ID = ethers.encodeBytes32String("escrow-1");

describe("PaymentRouter", function () {
  let router, payer, payee, feeRecipient, refundTo, stranger;

  beforeEach(async function () {
    [payer, payee, feeRecipient, refundTo, stranger] = await ethers.getSigners();
    router = await ethers.deployContract("PaymentRouter");
  });

  describe("payAndSplit", function () {
    it("splits payment between payee and fee recipient atomically", async function () {
      const amount = ethers.parseEther("100");
      const feeBps = 250; // 2.5%
      const expectedFee = (amount * 250n) / 10_000n;
      const expectedNet = amount - expectedFee;

      await expect(
        router
          .connect(payer)
          .payAndSplit(payee.address, feeRecipient.address, feeBps, REF, {
            value: amount,
          })
      ).to.changeEtherBalances(
        [payee, feeRecipient],
        [expectedNet, expectedFee]
      );
    });

    it("sends the full amount to payee when feeBps is 0", async function () {
      const amount = ethers.parseEther("50");
      await expect(
        router
          .connect(payer)
          .payAndSplit(payee.address, ethers.ZeroAddress, 0, REF, { value: amount })
      ).to.changeEtherBalances([payee, feeRecipient], [amount, 0n]);
    });

    it("emits PaymentSplit with the reference", async function () {
      const amount = ethers.parseEther("10");
      await expect(
        router
          .connect(payer)
          .payAndSplit(payee.address, feeRecipient.address, 100, REF, {
            value: amount,
          })
      )
        .to.emit(router, "PaymentSplit")
        .withArgs(
          REF,
          payer.address,
          payee.address,
          feeRecipient.address,
          amount - amount / 100n,
          amount / 100n
        );
    });

    it("reverts on zero amount, zero payee, or fee > 100%", async function () {
      await expect(
        router.payAndSplit(payee.address, feeRecipient.address, 100, REF, { value: 0 })
      ).to.be.revertedWithCustomError(router, "ZeroAmount");
      await expect(
        router.payAndSplit(ethers.ZeroAddress, feeRecipient.address, 100, REF, {
          value: 1n,
        })
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
      await expect(
        router.payAndSplit(payee.address, feeRecipient.address, 10_001, REF, {
          value: 1n,
        })
      ).to.be.revertedWithCustomError(router, "FeeTooHigh");
    });

    it("reverts when a fee is charged but no fee recipient is set", async function () {
      await expect(
        router.payAndSplit(payee.address, ethers.ZeroAddress, 100, REF, { value: 1n })
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
    });
  });

  describe("escrow", function () {
    const amount = ethers.parseEther("100");
    const feeBps = 500; // 5%

    async function open() {
      return router
        .connect(payer)
        .openEscrow(ID, payee.address, feeRecipient.address, refundTo.address, feeBps, {
          value: amount,
        });
    }

    it("holds funds on open, then splits to payee and fee recipient on release", async function () {
      await expect(open()).to.changeEtherBalance(router, amount);

      const fee = (amount * 500n) / 10_000n;
      const net = amount - fee;
      await expect(router.connect(payee).release(ID)).to.changeEtherBalances(
        [payee, feeRecipient, router],
        [net, fee, -amount]
      );
    });

    it("routes funds to the refund address on refund", async function () {
      await open();
      await expect(router.connect(payer).refund(ID)).to.changeEtherBalances(
        [refundTo, router],
        [amount, -amount]
      );
    });

    it("lets the payer release too", async function () {
      await open();
      await expect(router.connect(payer).release(ID)).to.emit(router, "EscrowReleased");
    });

    it("rejects a duplicate escrow id", async function () {
      await open();
      await expect(open()).to.be.revertedWithCustomError(router, "EscrowExists");
    });

    it("rejects release/refund from a stranger", async function () {
      await open();
      await expect(
        router.connect(stranger).release(ID)
      ).to.be.revertedWithCustomError(router, "NotAuthorized");
      await expect(
        router.connect(stranger).refund(ID)
      ).to.be.revertedWithCustomError(router, "NotAuthorized");
    });

    it("cannot release or refund twice", async function () {
      await open();
      await router.connect(payee).release(ID);
      await expect(
        router.connect(payee).release(ID)
      ).to.be.revertedWithCustomError(router, "EscrowNotFunded");
      await expect(
        router.connect(payer).refund(ID)
      ).to.be.revertedWithCustomError(router, "EscrowNotFunded");
    });
  });
});
