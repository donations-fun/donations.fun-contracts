import { sortBy } from 'lodash';

import chai from 'chai';
import { ethers, solidityPacked, ZeroAddress, ContractFactory, Wallet } from 'ethers';
import { deployContract, expectRevert, getWallet, LOCAL_RICH_WALLETS } from '../utils';
import { APPROVE_MESSAGES, domainSeparator, getProof } from '../gateway/AxelarAmplifierGateway.test';

const { id, keccak256, toUtf8Bytes, AbiCoder } = ethers;
const { expect } = chai;

describe('Donate.sol', () => {
    const numSigners = 5;
    const threshold = 3;
    const previousSignersRetention = 15;

    let owner: Wallet;
    let operator: Wallet;
    let user: Wallet;
    let signers;
    let weightedSigners;

    let gatewayFactory;
    let gateway;
    let implementation;

    let simpleBridge;

    before(async () => {
        owner = getWallet(LOCAL_RICH_WALLETS[0].privateKey);
        operator = getWallet(LOCAL_RICH_WALLETS[1].privateKey);
        user = getWallet(LOCAL_RICH_WALLETS[2].privateKey);

        signers = sortBy(
            Array.from({ length: numSigners }, (_, i) => getWallet(LOCAL_RICH_WALLETS[i].privateKey)),
            (wallet) => wallet.address.toLowerCase()
        );

        weightedSigners = {
            signers: signers.map((wallet) => ({ signer: wallet.address, weight: 1 })),
            threshold,
            nonce: id('0'),
        };

        gatewayFactory = new ContractFactory(AxelarAmplifierGateway.abi, AxelarAmplifierGateway.bytecode, owner);
    });

    beforeEach(async () => {
        const gatewayAddress = await deployGateway();

        simpleBridge = await deployContract('Donate.sol', [gatewayAddress, await owner.getAddress()], {
            wallet: owner,
        });
    });

    const deployGateway = async (minimumRotationDelay = 0) => {
        const signers = AbiCoder.defaultAbiCoder().encode(
            ['address', `${WEIGHTED_SIGNERS_TYPE}[]`],
            [operator.address, [weightedSigners]]
        );

        implementation = await deployContract(
            'AxelarAmplifierGateway',
            [previousSignersRetention, domainSeparator, minimumRotationDelay],
            { wallet: owner }
        );

        const proxy = await deployContract(
            'AxelarAmplifierGatewayProxy',
            [await implementation.getAddress(), owner.address, signers],
            { wallet: owner }
        );

        const gatewayAddress = await proxy.getAddress();

        gateway = gatewayFactory.attach(gatewayAddress);

        return gatewayAddress;
    };

    describe('tokens', () => {
        const tokenId = '0x47a73af03e892b97d22f0f6fc8d7b6e901d7fbadea01eb88596fe6e5eefc96a3';
        const tokenAddress = '0x69Cc41cA2B91689CD1adAF37e985BC7E5742B882';
        const tokenType = 0n;

        it('add known token not owner', async () => {
            await expectRevert(
                () => {
                    return simpleBridge.connect(user).addKnownToken(tokenId, tokenAddress, tokenType);
                },
                simpleBridge,
                'NotOwner'
            );
        });

        it('add known token', async () => {
            await simpleBridge.connect(owner).addKnownToken(tokenId, tokenAddress, tokenType);

            const result = await simpleBridge.knownTokens(tokenId);
            expect(result).deep.eq([tokenAddress, tokenType]);
        });

        it('remove known token not owner', async () => {
            await expectRevert(
                () => {
                    return simpleBridge.connect(user).removeKnownToken(tokenId);
                },
                simpleBridge,
                'NotOwner'
            );
        });

        it('remove known token', async () => {
            await simpleBridge.connect(owner).addKnownToken(tokenId, tokenAddress, tokenType);

            await simpleBridge.connect(owner).removeKnownToken(tokenId);

            const result = await simpleBridge.knownTokens(tokenId);
            expect(result).deep.eq([ZeroAddress, 0n]);
        });
    });

    describe('chains', () => {
        const chainName = 'fatom';
        const chainAddress = '0x385C37cd96487267A7726eBF2Cb27eB65aD25dE4';

        it('add known chain not owner', async () => {
            await expectRevert(
                () => {
                    return simpleBridge.connect(user).addKnownChain(chainName, chainAddress);
                },
                simpleBridge,
                'NotOwner'
            );
        });

        it('add known chain', async () => {
            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);

            let result = await simpleBridge.knownChainsAddresses(chainName);
            expect(result).eq(chainAddress);

            result = await simpleBridge.knownChainsNames(chainAddress);
            expect(result).eq(chainName);
        });

        it('remove known chain not owner', async () => {
            await expectRevert(
                () => {
                    return simpleBridge.connect(user).removeKnownChain(chainName);
                },
                simpleBridge,
                'NotOwner'
            );
        });

        it('remove known chain', async () => {
            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);

            await simpleBridge.connect(owner).removeKnownChain(chainName);

            let result = await simpleBridge.knownChainsAddresses(chainName);
            expect(result).eq('');

            result = await simpleBridge.knownChainsNames(chainAddress);
            expect(result).eq('');
        });
    });

    describe('send token', () => {
        const chainName = 'fatom';
        const chainAddress = '0x385C37cd96487267A7726eBF2Cb27eB65aD25dE4';

        const tokenName = 'Test Token';
        const tokenSymbol = 'TEST';
        const initialSupply = '1000';

        const tokenType = 0n; // Lock/Unlock
        const tokenId = keccak256(toUtf8Bytes(tokenName));

        let token;

        beforeEach(async () => {
            token = await deployContract(
                'TestERC20',
                [tokenName, tokenSymbol, await owner.getAddress(), initialSupply],
                { wallet: owner }
            );
        });

        it('unknown chain', async () => {
            expect(
                simpleBridge.connect(owner).sendToken(chainName, tokenId, await owner.getAddress(), 10)
            ).to.be.revertedWithoutReason();
        });

        it('unknown token', async () => {
            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);

            expect(
                simpleBridge.connect(owner).sendToken(chainName, tokenId, await owner.getAddress(), 10)
            ).to.be.revertedWithoutReason();
        });

        it('no token approval', async () => {
            const tokenAddress = await token.getAddress();

            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);
            await simpleBridge.connect(owner).addKnownToken(tokenId, tokenAddress, tokenType);

            expect(
                simpleBridge.connect(owner).sendToken(chainName, tokenId, await owner.getAddress(), 10)
            ).to.be.revertedWith('ERC20: insufficient allowance');
        });

        it('send token successfully', async () => {
            const ownerAddress = await owner.getAddress();
            const tokenAddress = await token.getAddress();

            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);
            await simpleBridge.connect(owner).addKnownToken(tokenId, tokenAddress, tokenType);

            const simpleBridgeAddress = await simpleBridge.getAddress();
            const amount = 10;

            await token.connect(owner).approve(simpleBridgeAddress, amount);

            const payload = solidityPacked(['bytes32', 'uint256', 'bytes'], [tokenId, amount, ownerAddress]);

            await expect(simpleBridge.connect(owner).sendToken(chainName, tokenId, ownerAddress, 10))
                .to.emit(simpleBridge, 'TokenSent')
                .withArgs(ownerAddress, chainName, ownerAddress, tokenId, tokenAddress, amount)
                .to.emit(gateway, 'ContractCall')
                .withArgs(simpleBridgeAddress, chainName, chainAddress, keccak256(payload), payload);

            let result = await token.balanceOf(ownerAddress);
            expect(result).eq(990);

            result = await token.balanceOf(simpleBridgeAddress);
            expect(result).eq(10);
        });
    });

    describe('execute', () => {
        const chainName = 'fatom';
        const chainAddress = '0x385C37cd96487267A7726eBF2Cb27eB65aD25dE4';

        const tokenName = 'Test Token';
        const tokenSymbol = 'TEST';
        const initialSupply = '0';

        const tokenType = 1n; // Ming/Burn
        const tokenId = keccak256(toUtf8Bytes(tokenName));
        const amount = 10;

        let token;

        beforeEach(async () => {
            token = await deployContract(
                'TestERC20',
                [tokenName, tokenSymbol, await simpleBridge.getAddress(), initialSupply],
                { wallet: owner }
            );
        });

        const approveMessage = async () => {
            const ownerAddress = await owner.getAddress();
            const contractAddress = await simpleBridge.getAddress();

            const messageId = '1';
            const payload = solidityPacked(['bytes32', 'uint256', 'bytes'], [tokenId, amount, ownerAddress]);
            const payloadHash = keccak256(payload);
            const commandId = await gateway.messageToCommandId(chainName, messageId);

            const messages = [
                {
                    sourceChain: chainName,
                    messageId,
                    sourceAddress: chainAddress,
                    contractAddress,
                    payloadHash,
                },
            ];

            const proof = await getProof(APPROVE_MESSAGES, messages, weightedSigners, signers.slice(0, threshold));

            await expect(gateway.approveMessages(messages, proof))
                .to.emit(gateway, 'MessageApproved')
                .withArgs(commandId, chainName, messageId, chainAddress, contractAddress, payloadHash);

            return { commandId, payload };
        };

        it('unknown chain', async () => {
            const { commandId, payload } = await approveMessage();

            expect(
                simpleBridge.connect(owner).execute(commandId, chainName, chainAddress, payload)
            ).to.be.revertedWithoutReason();
        });

        it('unknown token', async () => {
            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);

            const { commandId, payload } = await approveMessage();

            expect(
                simpleBridge.connect(owner).execute(commandId, chainName, chainAddress, payload)
            ).to.be.revertedWithoutReason();
        });

        it('receive token successfully', async () => {
            const ownerAddress = await owner.getAddress();
            const tokenAddress = await token.getAddress();

            await simpleBridge.connect(owner).addKnownChain(chainName, chainAddress);
            await simpleBridge.connect(owner).addKnownToken(tokenId, tokenAddress, tokenType);

            const { commandId, payload } = await approveMessage();

            const amount = 10;

            await expect(simpleBridge.connect(owner).execute(commandId, chainName, chainAddress, payload))
                .to.emit(simpleBridge, 'TokenReceived')
                .withArgs(ownerAddress, chainName, tokenId, tokenAddress, amount)
                .to.emit(gateway, 'MessageExecuted')
                .withArgs(commandId);

            let result = await token.balanceOf(ownerAddress);
            expect(result).eq(10);

            result = await token.balanceOf(await simpleBridge.getAddress());
            expect(result).eq(0);
        });
    });
});
