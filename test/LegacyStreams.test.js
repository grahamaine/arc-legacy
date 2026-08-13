const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE = ethers.parseEther("1");

describe("LegacyStreams", function () {
  let streams, creator, recipient, stranger;

  beforeEach(async function () {
    [creator, recipient, stranger] = await ethers.getSigners();
    streams = await ethers.deployContract("LegacyStreams");
  });

  // Create a stream: 1 USDC every `interval`s, funded with `fund` USDC.
  async function create(interval = 1000, fund = "5", endTime = 0) {
    const tx = await streams
      .connect(creator)
      .createStream(recipient.address, ONE, interval, endTime, {
        value: ethers.parseEther(fund),
      });
    await tx.wait();
    return await streams.streamCount(); // id of the stream just created
  }

  describe("createStream", function () {
    it("escrows the initial funding and records the schedule", async function () {
      await expect(
        streams.createStream(recipient.address, ONE, 1000, 0, {
          value: ethers.parseEther("5"),
        })
      ).to.changeEtherBalance(streams, ethers.parseEther("5"));
      const s = await streams.getStream(1);
      expect(s.creator).to.equal(creator.address);
      expect(s.recipient).to.equal(recipient.address);
      expect(s.amount).to.equal(ONE);
      expect(s.interval).to.equal(1000n);
      expect(s.balance).to.equal(ethers.parseEther("5"));
      expect(s.active).to.equal(true);
      const now = BigInt(await time.latest());
      expect(s.nextDue).to.equal(now + 1000n);
    });

    it("emits StreamCreated and lists the id under the creator", async function () {
      await expect(
        streams.createStream(recipient.address, ONE, 1000, 0, { value: ONE })
      ).to.emit(streams, "StreamCreated");
      expect(await streams.streamsOf(creator.address)).to.deep.equal([1n]);
    });

    it("reverts on bad inputs", async function () {
      await expect(
        streams.createStream(ethers.ZeroAddress, ONE, 1000, 0, { value: ONE })
      ).to.be.revertedWithCustomError(streams, "ZeroAddress");
      await expect(
        streams.createStream(recipient.address, 0, 1000, 0, { value: ONE })
      ).to.be.revertedWithCustomError(streams, "ZeroAmount");
      await expect(
        streams.createStream(recipient.address, ONE, 0, 0, { value: ONE })
      ).to.be.revertedWithCustomError(streams, "ZeroInterval");
      await expect(
        streams.createStream(recipient.address, ONE, 1000, 0, { value: 0 })
      ).to.be.revertedWithCustomError(streams, "ZeroAmount");
      const past = (await time.latest()) - 10;
      await expect(
        streams.createStream(recipient.address, ONE, 1000, past, { value: ONE })
      ).to.be.revertedWithCustomError(streams, "BadEndTime");
    });
  });

  describe("executeDue", function () {
    it("is not due until an interval has elapsed", async function () {
      await create(1000, "5");
      expect(await streams.isDue(1)).to.equal(false);
      await expect(streams.executeDue(1)).to.be.revertedWithCustomError(
        streams,
        "NotDue"
      );
    });

    it("pays the recipient one period once due and advances the schedule", async function () {
      await create(1000, "5");
      const due = (await streams.getStream(1)).nextDue;
      await time.increaseTo(due);
      expect(await streams.isDue(1)).to.equal(true);

      await expect(streams.executeDue(1)).to.changeEtherBalances(
        [recipient, streams],
        [ONE, -ONE]
      );
      const s = await streams.getStream(1);
      expect(s.balance).to.equal(ethers.parseEther("4"));
      expect(s.nextDue).to.equal(due + 1000n);
    });

    it("is permissionless — a stranger (or the keeper) can settle it", async function () {
      await create(1000, "5");
      await time.increase(1000);
      await expect(
        streams.connect(stranger).executeDue(1)
      ).to.changeEtherBalance(recipient, ONE);
    });

    it("lets a caller catch up multiple missed periods over successive calls", async function () {
      await create(1000, "5");
      await time.increase(3500); // three periods have come due
      await expect(streams.executeDue(1)).to.changeEtherBalance(recipient, ONE);
      await expect(streams.executeDue(1)).to.changeEtherBalance(recipient, ONE);
      await expect(streams.executeDue(1)).to.changeEtherBalance(recipient, ONE);
      // Fourth period not yet due.
      await expect(streams.executeDue(1)).to.be.revertedWithCustomError(
        streams,
        "NotDue"
      );
      expect((await streams.getStream(1)).balance).to.equal(ethers.parseEther("2"));
    });

    it("reverts when the escrowed balance can't cover the next payout", async function () {
      const id = await create(1000, "1"); // funds exactly one payout
      await time.increase(1000);
      await streams.executeDue(id); // spends the only funded payout
      await time.increase(1000);
      await expect(streams.executeDue(id)).to.be.revertedWithCustomError(
        streams,
        "InsufficientStreamBalance"
      );
    });
  });

  describe("fund", function () {
    it("tops up the balance so payouts can resume", async function () {
      const id = await create(1000, "1");
      await time.increase(1000);
      await streams.executeDue(id); // balance now 0
      await streams.fund(id, { value: ethers.parseEther("2") });
      expect((await streams.getStream(id)).balance).to.equal(ethers.parseEther("2"));
      await time.increase(1000);
      await expect(streams.executeDue(id)).to.changeEtherBalance(recipient, ONE);
    });

    it("reverts funding an unknown or inactive stream", async function () {
      await expect(
        streams.fund(999, { value: ONE })
      ).to.be.revertedWithCustomError(streams, "UnknownStream");
      const id = await create();
      await streams.connect(creator).cancel(id);
      await expect(
        streams.fund(id, { value: ONE })
      ).to.be.revertedWithCustomError(streams, "StreamInactive");
    });
  });

  describe("endTime", function () {
    it("stops after the end, refunds the remainder, and marks complete", async function () {
      // interval 1000, funded 3, end after ~2 payouts.
      const start = await time.latest();
      const endTime = start + 2500;
      await streams.createStream(recipient.address, ONE, 1000, endTime, {
        value: ethers.parseEther("3"),
      });

      await time.increaseTo(start + 1000);
      await streams.executeDue(1); // payout 1
      await time.increaseTo(start + 2000);
      // Second payout also completes the schedule (next would be past endTime),
      // paying the recipient and refunding the unspent balance to the creator.
      await expect(streams.executeDue(1)).to.changeEtherBalances(
        [recipient, creator],
        [ONE, ONE]
      );
      const s = await streams.getStream(1);
      expect(s.active).to.equal(false);
      expect(s.balance).to.equal(0n);
      await expect(streams.executeDue(1)).to.be.revertedWithCustomError(
        streams,
        "StreamInactive"
      );
    });
  });

  describe("cancel", function () {
    it("refunds the unspent balance to the creator and deactivates", async function () {
      const id = await create(1000, "5");
      await expect(streams.connect(creator).cancel(id)).to.changeEtherBalances(
        [creator, streams],
        [ethers.parseEther("5"), ethers.parseEther("-5")]
      );
      expect((await streams.getStream(id)).active).to.equal(false);
    });

    it("only the creator can cancel", async function () {
      const id = await create();
      await expect(
        streams.connect(stranger).cancel(id)
      ).to.be.revertedWithCustomError(streams, "NotCreator");
    });

    it("cannot be executed after cancellation", async function () {
      const id = await create(1000, "5");
      await streams.connect(creator).cancel(id);
      await time.increase(1000);
      await expect(streams.executeDue(id)).to.be.revertedWithCustomError(
        streams,
        "StreamInactive"
      );
    });
  });
});
