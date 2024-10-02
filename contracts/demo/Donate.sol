//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AxelarGMPExecutable} from "../executable/AxelarGMPExecutable.sol";
import {InterchainTokenExecutable} from "../executable/InterchainTokenExecutable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

contract Donate is AxelarGMPExecutable, Initializable, UUPSUpgradeable, OwnableUpgradeable, InterchainTokenExecutable {
    using BytesLib for bytes;

    enum TokenType {
        LockUnlock,
        MintBurn
    }

    struct KnownToken {
        address tokenAddress;
        TokenType tokenType;
    }

    mapping(bytes32 => KnownToken) public knownTokens;
    mapping(string => string) public knownChainsAddresses;
    mapping(string => string) public knownChainsNames;

    address public interchainTokenService;

    function initialize(address _gateway, address _owner) public initializer {
        _transferOwnership(_owner);
        __UUPSUpgradeable_init();

        gatewayAddress = _gateway;
    }

    function reinitialize(address _interchainTokenService) public reinitializer(2) {
        interchainTokenService = _interchainTokenService;
    }

    event TokenSent(
        address indexed sender,
        string destinationChain,
        bytes receiverAddress,
        bytes32 indexed tokenId,
        address token,
        uint256 amount
    );

    event TokenReceived(
        address indexed receiver,
        string sourceChain,
        bytes32 indexed tokenId,
        address token,
        uint256 amount
    );

    function addKnownToken(bytes32 tokenId, address tokenAddress, TokenType tokenType) external onlyOwner {
        knownTokens[tokenId] = KnownToken(tokenAddress, tokenType);
    }

    function removeKnownToken(bytes32 tokenId) external onlyOwner {
        delete knownTokens[tokenId];
    }

    function addKnownChain(string calldata chainName, string calldata chainAddress) external onlyOwner {
        knownChainsAddresses[chainName] = chainAddress;
        knownChainsNames[chainAddress] = chainName;
    }

    function removeKnownChain(string calldata chainName) external onlyOwner {
        string memory chainAddress = knownChainsAddresses[chainName];

        delete knownChainsNames[chainAddress];
        delete knownChainsAddresses[chainName];
    }

    function sendToken(
        string calldata destinationChain,
        bytes32 tokenId,
        bytes calldata receiverAddress,
        uint256 amount
    ) external payable {
        string memory destinationAddress = knownChainsAddresses[destinationChain];

        require(bytes(destinationAddress).length > 0);

        KnownToken memory knownToken = checkKnownToken(tokenId, amount);

        IERC20(knownToken.tokenAddress).transferFrom(msg.sender, address(this), amount);

        if (knownToken.tokenType == TokenType.MintBurn) {
//            TestERC20(knownToken.tokenAddress).burn(amount);
        }

        // Use encodePacked so it is easier to decode on another chain without abi support
        bytes memory payload = abi.encodePacked(tokenId, amount, receiverAddress);

        gateway().callContract(destinationChain, destinationAddress, payload);

        emit TokenSent(msg.sender, destinationChain, receiverAddress, tokenId, knownToken.tokenAddress, amount);
    }

    function _execute(
        bytes32,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        string memory sourceChainName = knownChainsNames[sourceAddress];

        require(bytes(sourceChainName).length > 0);

        // Decodes the encodePacked encoded payload, which should be easy to create from other chains without abi support
        bytes32 tokenId = payload.toBytes32(0);
        uint256 amount = payload.toUint256(32);
        address receiver = payload.toAddress(64);

        KnownToken memory knownToken = checkKnownToken(tokenId, amount);

        if (knownToken.tokenType == TokenType.MintBurn) {
//            TestERC20(knownToken.tokenAddress).mint(amount);
        }

        IERC20(knownToken.tokenAddress).transfer(receiver, amount);

        emit TokenReceived(receiver, sourceChain, tokenId, knownToken.tokenAddress, amount);
    }

    function checkKnownToken(bytes32 tokenId, uint256 amount) view internal returns (KnownToken memory) {
        KnownToken memory knownToken = knownTokens[tokenId];

        require(knownToken.tokenAddress != address(0));
        require(amount > 0);

        return knownToken;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _executeWithInterchainToken(
        bytes32, // commandId
        string calldata sourceChain,
        bytes calldata, // sourceAddress,
        bytes calldata payload,
        bytes32, // itsTokenId
        address token,
        uint256 amount
    ) override internal virtual {
        // Decodes the encodePacked encoded payload, which should be easy to create from other chains without abi support
        bytes32 tokenId = payload.toBytes32(0);
        uint256 newAmount = payload.toUint256(32);
        address receiver = payload.toAddress(64);

        require(amount == newAmount);

        KnownToken memory knownToken = checkKnownToken(tokenId, amount);

        require(knownToken.tokenAddress == token);

        IERC20(token).transfer(receiver, amount);

        emit TokenReceived(receiver, sourceChain, tokenId, knownToken.tokenAddress, amount);
    }

    function _getInterchainTokenService() override internal virtual returns (address) {
        return interchainTokenService;
    }
}
