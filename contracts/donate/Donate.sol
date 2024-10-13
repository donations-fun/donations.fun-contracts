//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {InterchainTokenExecutable} from "../executable/InterchainTokenExecutable.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {IInterchainTokenService} from "../interfaces/IInterchainTokenService.sol";

contract Donate is Initializable, UUPSUpgradeable, OwnableUpgradeable, InterchainTokenExecutable {
    using BytesLib for bytes;
    using SafeERC20 for IERC20;

    struct TokenAnalytic {
        address token;
        uint256 amount;
    }

    mapping(bytes32 => address) public knownCharities;
    mapping(address => bool) public analyticsTokens;
    mapping(address => TokenAnalytic[]) public addressAnalytics;
    mapping(bytes32 => KnownCharityInterchain) public knownCharitiesInterchain;

    function initialize(address _owner, address _interchainTokenService) public initializer {
        _transferOwnership(_owner);
        __UUPSUpgradeable_init();

        interchainTokenService = _interchainTokenService;
    }

    // For the future if upgrading and need to change initialize parameters
    function reinitialize() public reinitializer(3) {}

    event AddKnownCharity(
        bytes32 indexed charityId,
        string charityName,
        address indexed charityAddress
    );

    event RemoveKnownCharity(
        bytes32 indexed charityId,
        string charityName,
        address indexed charityAddress
    );

    event AddKnownCharityInterchain(
        bytes32 indexed charityId,
        string charityName,
        string destinationChain,
        bytes charityAddress
    );

    event RemoveKnownCharityInterchain(
        bytes32 indexed charityId,
        string charityName,
        string destinationChain,
        bytes charityAddress
    );

    event AddAnalyticToken(
        address indexed token
    );

    event RemoveAnalyticToken(
        address indexed token
    );

    event Donation(
        address indexed user,
        address indexed token,
        bytes32 indexed charityId,
        string charityName,
        uint256 amount
    );

    struct CrossChainData {
        string sourceChain;
        bytes sourceAddress;
    }

    event DonationCrosschain(
        address indexed user, // can be zero address
        address indexed token,
        bytes32 indexed charityId,
        uint256 amount,
        CrossChainData data
    );

    struct InterchainData {
        bytes32 tokenId;
        string destinationChain;
    }

    event DonationInterchain(
        address indexed user,
        address indexed token,
        bytes32 indexed charityId,
        string charityName,
        uint256 amount,
        InterchainData data
    );

    struct KnownCharityInterchain {
        string destinationChain;
        bytes charityAddress;
    }

    function addKnownCharity(string calldata charityName, address charityAddress) external onlyOwner {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));

        // Do not allow to have the same charity both as native and as interchain
        require(knownCharitiesInterchain[charityId].charityAddress.length == 0, "charity already known interchain");

        knownCharities[charityId] = charityAddress;

        emit AddKnownCharity(charityId, charityName, charityAddress);
    }

    function removeKnownCharity(string calldata charityName) external onlyOwner {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));

        address charityAddress = knownCharities[charityId];

        delete knownCharities[charityId];

        emit RemoveKnownCharity(charityId, charityName, charityAddress);
    }

    function addKnownCharityInterchain(string calldata charityName, string calldata destinationChain, bytes calldata charityAddress) external onlyOwner {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));

        // Do not allow to have the same charity both as native and as interchain
        require(knownCharities[charityId] == address(0), "charity already known");

        knownCharitiesInterchain[charityId] = KnownCharityInterchain(destinationChain, charityAddress);

        emit AddKnownCharityInterchain(charityId, charityName, destinationChain, charityAddress);
    }

    function removeKnownCharityInterchain(string calldata charityName) external onlyOwner {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));

        KnownCharityInterchain memory knownCharityInterchain = knownCharitiesInterchain[charityId];

        delete knownCharitiesInterchain[charityId];

        emit RemoveKnownCharityInterchain(charityId, charityName, knownCharityInterchain.destinationChain, knownCharityInterchain.charityAddress);
    }

    function addAnalyticsToken(address tokenAddress) external onlyOwner {
        analyticsTokens[tokenAddress] = true;

        emit AddAnalyticToken(tokenAddress);
    }

    function removeAnalyticToken(address tokenAddress) external onlyOwner {
        delete analyticsTokens[tokenAddress];

        emit RemoveAnalyticToken(tokenAddress);
    }

    function donate(string calldata charityName, address token, uint256 amount) external payable {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));
        address user = msg.sender;

        address charityAddress = _donate(user, charityId, token, amount);

        IERC20(token).safeTransferFrom(user, charityAddress, amount);

        emit Donation(user, token, charityId, charityName, amount);
    }

    function donateInterchain(
        string calldata charityName,
        address token,
        uint256 amount,
        bytes32 tokenId,
        string calldata destinationChain
    ) external payable {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));
        address user = msg.sender;

        bytes storage charityAddress = _donateInterchain(user, charityId, token, amount, destinationChain);

        IERC20 tokenInterface = IERC20(token);

        tokenInterface.safeTransferFrom(user, address(this), amount);
        tokenInterface.approve(interchainTokenService, amount);

        IInterchainTokenService(interchainTokenService)
        .interchainTransfer{value: msg.value}(
            tokenId,
            destinationChain,
            charityAddress,
            amount,
            "",
            msg.value
        );

        InterchainData memory data = InterchainData(tokenId, destinationChain);

        emit DonationInterchain(user, token, charityId, charityName, amount, data);
    }

    // Implement donateForOther that accept a user as the argument?

    function _executeWithInterchainToken(
        bytes32, // commandId
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes calldata payload,
        bytes32, // itsTokenId
        address token,
        uint256 amount
    ) override internal virtual {
        // Decodes the encodePacked encoded payload, which should be easy to create from other chains without abi support
        bytes32 charityId = payload.toBytes32(0);
        address user = payload.toAddress(32); // can be zero address

        address charityAddress = _donate(user, charityId, token, amount);

        IERC20(token).safeTransfer(charityAddress, amount);

        CrossChainData memory data = CrossChainData(sourceChain, sourceAddress);

        emit DonationCrosschain(user, token, charityId, amount, data);
    }

    function _donate(address user, bytes32 charityId, address token, uint256 amount) internal returns (address) {
        address charityAddress = knownCharities[charityId];

        require(charityAddress != address(0), "charity does not exist");
        require(amount > 0, "Donation amount must be greater than zero");

        _handleAnalytics(user, token, amount);

        return charityAddress;
    }

    function _donateInterchain(address user, bytes32 charityId, address token, uint256 amount, string calldata destinationChain) internal returns (bytes storage) {
        KnownCharityInterchain storage knownCharityInterchain = knownCharitiesInterchain[charityId];

        require(knownCharityInterchain.charityAddress.length > 0, "charity does not exist");
        require(
            keccak256(abi.encodePacked(knownCharityInterchain.destinationChain))
                == keccak256(abi.encodePacked(destinationChain)),
            "invalid destination chain"
        );
        require(amount > 0, "Donation amount must be greater than zero");

        _handleAnalytics(user, token, amount);

        return knownCharityInterchain.charityAddress;
    }

    function _handleAnalytics(address user, address token, uint256 amount) internal {
        if (user != address(0) && analyticsTokens[token]) {
            TokenAnalytic[] storage analytics = addressAnalytics[user];

            bool tokenFound = false;

            for (uint i = 0; i < analytics.length; i++) {
                if (analytics[i].token == token) {
                    analytics[i].amount += amount;
                    tokenFound = true;
                    break;
                }
            }

            if (!tokenFound) {
                analytics.push(TokenAnalytic({
                    token: token,
                    amount: amount
                }));
            }
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
