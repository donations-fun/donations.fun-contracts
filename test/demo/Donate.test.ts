import { AbiCoder, keccak256, parseUnits, ZeroAddress } from 'ethers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Donate Contract', function() {
  let Donate;
  let donate;
  let owner;
  let addr1;

  const charityName = 'first-charity';
  const charityAddress = '0x0000000000000000000000000000000000000001';
  let tokenAddress = "0x0000000000000000000000000000000000000002";

  beforeEach(async function() {
    // Get the ContractFactory and Signers here.
    Donate = await ethers.getContractFactory('Donate');
    [owner, addr1] = await ethers.getSigners();

    // Deploy the contract
    donate = await Donate.deploy();
    await donate.initialize(owner.address, ZeroAddress);
  });

  describe('addKnownCharity', function() {
    it('should add a known charity and emit an event', async function() {
      const charityId = keccak256(Buffer.from(charityName));

      // Listen for the event
      await expect(donate.addKnownCharity(charityName, charityAddress))
        .to.emit(donate, 'AddKnownCharity')
        .withArgs(charityId, charityName, charityAddress);

      // Verify that the charity has been added
      expect(await donate.knownCharities(charityId)).to.equal(charityAddress);
    });

    it('should revert if called by a non-owner', async function() {
      await expect(
        donate.connect(addr1).addKnownCharity(charityName, charityAddress),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('removeKnownCharity', function() {
    const charityId = keccak256(Buffer.from(charityName));

    beforeEach(async function() {
      // Add the charity before attempting to remove it
      await donate.addKnownCharity(charityName, charityAddress);
    });

    it('should remove a known charity and emit an event', async function() {
      await expect(donate.removeKnownCharity(charityName))
        .to.emit(donate, 'RemoveKnownCharity')
        .withArgs(charityId, charityName, charityAddress);

      // Verify that the charity has been removed
      expect(await donate.knownCharities(charityId)).to.equal(ZeroAddress);
    });

    it('should revert if called by a non-owner', async function() {
      await expect(
        donate.connect(addr1).removeKnownCharity(charityName),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe("addAnalyticsToken", function () {
    it("should add an analytics token and emit an event", async function () {
      await expect(donate.addAnalyticsToken(tokenAddress))
        .to.emit(donate, "AddAnalyticToken")
        .withArgs(tokenAddress);

      // Verify that the token has been added
      expect(await donate.analyticsTokens(tokenAddress)).to.be.true;
    });

    it("should revert if called by a non-owner", async function () {
      await expect(
        donate.connect(addr1).addAnalyticsToken(tokenAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("removeAnalyticToken", function () {
    beforeEach(async function () {
      // Add the token before attempting to remove it
      await donate.addAnalyticsToken(tokenAddress);
    });

    it("should remove an analytics token and emit an event", async function () {
      await expect(donate.removeAnalyticToken(tokenAddress))
        .to.emit(donate, "RemoveAnalyticToken")
        .withArgs(tokenAddress);

      // Verify that the token has been removed
      expect(await donate.analyticsTokens(tokenAddress)).to.be.false;
    });

    it("should revert if called by a non-owner", async function () {
      await expect(
        donate.connect(addr1).removeAnalyticToken(tokenAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("donate", function () {
    const donationAmount = parseUnits("10", 18); // 10 tokens
    let token;

    beforeEach(async function () {
      const initialSupply = 1000000; // 1 million tokens

      const Token = await ethers.getContractFactory("TestToken");
      token = await Token.deploy(initialSupply);

      await donate.addKnownCharity(charityName, charityAddress);
      await donate.addAnalyticsToken(await token.getAddress());
    });

    it("should process a donation and emit an event", async function () {
      await token.approve(await donate.getAddress(), donationAmount);

      const actualTokenAddress = await token.getAddress();

      await expect(donate.donate(charityName, actualTokenAddress, donationAmount))
        .to.emit(donate, "Donation")
        .withArgs(owner.address, actualTokenAddress, keccak256(Buffer.from(charityName)), charityName, donationAmount);

      // Verify that the charity received the donation
      expect(await token.balanceOf(charityAddress)).to.equal(donationAmount);

      // Verify analytics for the donor
      const analytics = await donate.addressAnalytics(owner.address, 0);
      expect(analytics[0]).to.equal(actualTokenAddress);
      expect(analytics[1]).to.equal(donationAmount);
    });

    it("should revert if charity does not exist", async function () {
      await expect(donate.donate("Nonexistent Charity", tokenAddress, donationAmount))
        .to.be.revertedWith("charity does not exist");
    });

    it("should revert if the donation amount is zero", async function () {
      await expect(donate.donate(charityName, tokenAddress, 0))
        .to.be.revertedWith("Donation amount must be greater than zero");
    });
  });
});
