//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {InterchainTokenExecutable} from "../executable/InterchainTokenExecutable.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

contract Donate is Initializable, UUPSUpgradeable, OwnableUpgradeable, InterchainTokenExecutable {
    using BytesLib for bytes;

    struct TokenAnalytic {
        address token;
        uint256 amount;
    }

    mapping(bytes32 => address) public knownCharities;
    mapping(address => bool) public analyticsTokens;
    mapping(address => TokenAnalytic[]) public addressAnalytics;

    function initialize(address _owner, address _interchainTokenService) public initializer {
        _transferOwnership(_owner);
        __UUPSUpgradeable_init();

        interchainTokenService = _interchainTokenService;
    }

    // For the future if upgrading and need to change initialize parameters
    // function reinitialize() public reinitializer(2) {}

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

    function addKnownCharity(string calldata charityName, address charityAddress) external onlyOwner {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));

        knownCharities[charityId] = charityAddress;

        emit AddKnownCharity(charityId, charityName, charityAddress);
    }

    function removeKnownCharity(string calldata charityName) external onlyOwner {
        bytes32 charityId = keccak256(abi.encodePacked(charityName));

        address charityAddress = knownCharities[charityId];

        delete knownCharities[charityId];

        emit RemoveKnownCharity(charityId, charityName, charityAddress);
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

        IERC20(token).transferFrom(user, charityAddress, amount);

        emit Donation(user, token, charityId, charityName, amount);
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

        IERC20(token).transfer(charityAddress, amount);

        CrossChainData memory data = CrossChainData(sourceChain, sourceAddress);

        emit DonationCrosschain(user, token, charityId, amount, data);
    }

    function _donate(address user, bytes32 charityId, address token, uint256 amount) internal returns (address) {
        address charityAddress = knownCharities[charityId];

        require(charityAddress != address(0), "charity does not exist");
        require(amount > 0, "Donation amount must be greater than zero");

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

        return charityAddress;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
