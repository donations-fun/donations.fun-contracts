import { Contract, ContractFactory, keccak256, parseUnits, ZeroAddress } from 'ethers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Donate Contract', function () {
  let Donate: ContractFactory;
  let TestITS: ContractFactory;

  let donate: Contract | any;
  let testIts: Contract | any;
  let owner;
  let addr1;

  const charityName = 'first-charity';
  const charityAddress = '0x0000000000000000000000000000000000000001';
  let tokenAddress = '0x0000000000000000000000000000000000000002';

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    Donate = await ethers.getContractFactory('Donate');
    [owner, addr1] = await ethers.getSigners();

    TestITS = await ethers.getContractFactory('TestITS');
    testIts = await TestITS.deploy();

    // Deploy the contract
    donate = await Donate.deploy();
    await donate.initialize(owner.address, await testIts.getAddress());
  });

  describe('addKnownCharity', function () {
    it('should add a known charity and emit an event', async function () {
      const charityId = keccak256(Buffer.from(charityName));

      // Listen for the event
      await expect(donate.addKnownCharity(charityName, charityAddress))
        .to.emit(donate, 'AddKnownCharity')
        .withArgs(charityId, charityName, charityAddress);

      // Verify that the charity has been added
      expect(await donate.knownCharities(charityId)).to.equal(charityAddress);
    });

    it('should revert if called by a non-owner', async function () {
      await expect(donate.connect(addr1).addKnownCharity(charityName, charityAddress)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('removeKnownCharity', function () {
    const charityId = keccak256(Buffer.from(charityName));

    beforeEach(async function () {
      // Add the charity before attempting to remove it
      await donate.addKnownCharity(charityName, charityAddress);
    });

    it('should remove a known charity and emit an event', async function () {
      await expect(donate.removeKnownCharity(charityName))
        .to.emit(donate, 'RemoveKnownCharity')
        .withArgs(charityId, charityName, charityAddress);

      // Verify that the charity has been removed
      expect(await donate.knownCharities(charityId)).to.equal(ZeroAddress);
    });

    it('should revert if called by a non-owner', async function () {
      await expect(donate.connect(addr1).removeKnownCharity(charityName)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('addKnownCharityInterchain', function () {
    it('should add a known charity and emit an event', async function () {
      const charityId = keccak256(Buffer.from(charityName));

      // Listen for the event
      await expect(donate.addKnownCharityInterchain(charityName, charityAddress))
        .to.emit(donate, 'AddKnownCharityInterchain')
        .withArgs(charityId, charityName, charityAddress);

      // Verify that the charity has been added
      expect(await donate.knownCharitiesInterchain(charityId)).to.equal(charityAddress);
    });

    it('should revert if called by a non-owner', async function () {
      await expect(donate.connect(addr1).addKnownCharityInterchain(charityName, charityAddress)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('removeKnownCharityInterchain', function () {
    const charityId = keccak256(Buffer.from(charityName));

    beforeEach(async function () {
      // Add the charity before attempting to remove it
      await donate.addKnownCharityInterchain(charityName, charityAddress);
    });

    it('should remove a known charity and emit an event', async function () {
      await expect(donate.removeKnownCharityInterchain(charityName))
        .to.emit(donate, 'RemoveKnownCharityInterchain')
        .withArgs(charityId, charityName, charityAddress);

      // Verify that the charity has been removed
      expect(await donate.knownCharitiesInterchain(charityId)).to.equal('0x');
    });

    it('should revert if called by a non-owner', async function () {
      await expect(donate.connect(addr1).removeKnownCharityInterchain(charityName)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('addAnalyticsToken', function () {
    it('should add an analytics token and emit an event', async function () {
      await expect(donate.addAnalyticsToken(tokenAddress)).to.emit(donate, 'AddAnalyticToken').withArgs(tokenAddress);

      // Verify that the token has been added
      expect(await donate.analyticsTokens(tokenAddress)).to.be.true;
    });

    it('should revert if called by a non-owner', async function () {
      await expect(donate.connect(addr1).addAnalyticsToken(tokenAddress)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('removeAnalyticToken', function () {
    beforeEach(async function () {
      // Add the token before attempting to remove it
      await donate.addAnalyticsToken(tokenAddress);
    });

    it('should remove an analytics token and emit an event', async function () {
      await expect(donate.removeAnalyticToken(tokenAddress))
        .to.emit(donate, 'RemoveAnalyticToken')
        .withArgs(tokenAddress);

      // Verify that the token has been removed
      expect(await donate.analyticsTokens(tokenAddress)).to.be.false;
    });

    it('should revert if called by a non-owner', async function () {
      await expect(donate.connect(addr1).removeAnalyticToken(tokenAddress)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('donate', function () {
    const donationAmount = parseUnits('10', 18); // 10 tokens
    let token;

    beforeEach(async function () {
      const initialSupply = 1000000; // 1 million tokens

      const Token = await ethers.getContractFactory('TestToken');
      token = await Token.deploy(initialSupply);

      await donate.addKnownCharity(charityName, charityAddress);
      await donate.addAnalyticsToken(await token.getAddress());
    });

    it('should process a donation and emit an event', async function () {
      await token.approve(await donate.getAddress(), donationAmount);

      const actualTokenAddress = await token.getAddress();

      await expect(donate.donate(charityName, actualTokenAddress, donationAmount))
        .to.emit(donate, 'Donation')
        .withArgs(owner.address, actualTokenAddress, keccak256(Buffer.from(charityName)), charityName, donationAmount);

      // Verify that the charity received the donation
      expect(await token.balanceOf(charityAddress)).to.equal(donationAmount);

      // Verify analytics for the donor
      const analytics = await donate.addressAnalytics(owner.address, 0);
      expect(analytics[0]).to.equal(actualTokenAddress);
      expect(analytics[1]).to.equal(donationAmount);
    });

    it('should revert if charity does not exist', async function () {
      await expect(donate.donate('Nonexistent Charity', tokenAddress, donationAmount)).to.be.revertedWith(
        'charity does not exist'
      );
    });

    it('should revert if the donation amount is zero', async function () {
      await expect(donate.donate(charityName, tokenAddress, 0)).to.be.revertedWith(
        'Donation amount must be greater than zero'
      );
    });
  });

  describe('donateInterchain', async function () {
    const donationAmount = parseUnits('10', 18); // 10 tokens
    const tokenId = keccak256(Buffer.from('tokenId'));
    let token;

    beforeEach(async function () {
      const initialSupply = 1000000; // 1 million tokens

      const Token = await ethers.getContractFactory('TestToken');
      token = await Token.deploy(initialSupply);

      await donate.addKnownCharityInterchain(charityName, charityAddress);
      await donate.addAnalyticsToken(await token.getAddress());
    });

    it('should process a donation and emit an event', async function () {
      await token.approve(await donate.getAddress(), donationAmount);

      const actualTokenAddress = await token.getAddress();

      await testIts.addKnownToken(tokenId, await token.getAddress());

      await expect(
        donate.donateInterchain(charityName, actualTokenAddress, donationAmount, tokenId, 'otherChain', {
          value: 1_000,
        })
      )
        .to.emit(donate, 'DonationInterchain')
        .withArgs(owner.address, actualTokenAddress, keccak256(Buffer.from(charityName)), charityName, donationAmount, [
          tokenId,
          'otherChain',
        ]);

      // TestITS will retain the balance and ether sent
      expect(await token.balanceOf(testIts)).to.equal(donationAmount);
      expect(await ethers.provider.getBalance(await testIts.getAddress())).to.equal(1_000);

      // Verify analytics for the donor
      const analytics = await donate.addressAnalytics(owner.address, 0);
      expect(analytics[0]).to.equal(actualTokenAddress);
      expect(analytics[1]).to.equal(donationAmount);
    });

    it('should revert if charity does not exist', async function () {
      await expect(
        donate.donateInterchain('Nonexistent Charity', tokenAddress, donationAmount, tokenId, '')
      ).to.be.revertedWith('charity does not exist');
    });

    it('should revert if the donation amount is zero', async function () {
      await expect(donate.donateInterchain(charityName, tokenAddress, 0, tokenId, '')).to.be.revertedWith(
        'Donation amount must be greater than zero'
      );
    });
  });

  describe('_executeWithInterchainToken', async function () {
    const donationAmount = parseUnits('10', 18); // 10 tokens
    const tokenId = keccak256(Buffer.from('tokenId'));
    const commandId = keccak256(Buffer.from('commandId'));
    const charityId = keccak256(Buffer.from(charityName));

    let token;

    beforeEach(async function () {
      const initialSupply = 1000000; // 1 million tokens

      const Token = await ethers.getContractFactory('TestToken');
      token = await Token.deploy(initialSupply);

      await donate.addKnownCharity(charityName, charityAddress);
      await donate.addAnalyticsToken(await token.getAddress());
    });

    it('should process a donation and emit an event', async function () {
      await token.approve(await testIts.getAddress(), donationAmount);

      const actualTokenAddress = await token.getAddress();

      await testIts.addKnownToken(tokenId, await token.getAddress());

      // Compute payload from other chain
      const payload = Buffer.concat([
        Buffer.from(charityId.slice(2), 'hex'),
        Buffer.from(owner.address.slice(2), 'hex'),
      ]);

      await expect(
        testIts.execute(
          await donate.getAddress(),
          commandId,
          'sourceChain',
          '0xAA', // source address
          payload,
          tokenId,
          actualTokenAddress,
          donationAmount
        )
      )
        .to.emit(donate, 'DonationCrosschain')
        .withArgs(owner.address, actualTokenAddress, charityId, donationAmount, ['sourceChain', '0xaa']);

      // Charity will receive tokens
      expect(await token.balanceOf(charityAddress)).to.equal(donationAmount);

      // Verify analytics for the donor
      const analytics = await donate.addressAnalytics(owner.address, 0);
      expect(analytics[0]).to.equal(actualTokenAddress);
      expect(analytics[1]).to.equal(donationAmount);
    });

    it('should revert if charity does not exist', async function () {
      await token.approve(await testIts.getAddress(), donationAmount);

      const actualTokenAddress = await token.getAddress();

      const payload = Buffer.concat([
        Buffer.from(keccak256(Buffer.from('otherCharity')).slice(2), 'hex'),
        Buffer.from(owner.address.slice(2), 'hex'),
      ]);

      await expect(
        testIts.execute(
          await donate.getAddress(),
          commandId,
          'sourceChain',
          '0xAA', // source address
          payload,
          tokenId,
          actualTokenAddress,
          donationAmount
        )
      ).to.be.revertedWith('charity does not exist');
    });

    it('should revert if the donation amount is zero', async function () {
      const actualTokenAddress = await token.getAddress();

      const payload = Buffer.concat([
        Buffer.from(charityId.slice(2), 'hex'),
        Buffer.from(owner.address.slice(2), 'hex'),
      ]);

      await expect(
        testIts.execute(
          await donate.getAddress(),
          commandId,
          'sourceChain',
          '0xAA', // source address
          payload,
          tokenId,
          actualTokenAddress,
          0
        )
      ).to.be.revertedWith('Donation amount must be greater than zero');
    });
  });
});
