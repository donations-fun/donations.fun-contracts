// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IInterchainTokenService} from "../interfaces/IInterchainTokenService.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IInterchainTokenExecutable} from "../interfaces/IInterchainTokenExecutable.sol";

contract TestITS is IInterchainTokenService {
    using SafeERC20 for IERC20;

    mapping(bytes32 => address) public knownTokens;

    function addKnownToken(bytes32 tokenId, address tokenAddress) external {
        knownTokens[tokenId] = tokenAddress;
    }

    function interchainTransfer(
        bytes32 tokenId,
        string calldata, // destinationChain
        bytes calldata, // destinationAddress
        uint256 amount,
        bytes calldata, // metadata
        uint256 // gasValue
    ) external payable {
        IERC20(knownTokens[tokenId]).safeTransferFrom(msg.sender, address(this), amount);
    }

    function execute(
        address contractAddress,
        bytes32 commandId,
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes calldata data,
        bytes32 tokenId,
        address token,
        uint256 amount
    ) external {
        IERC20(token).transferFrom(msg.sender,contractAddress, amount);

        IInterchainTokenExecutable(contractAddress)
            .executeWithInterchainToken(
            commandId,
            sourceChain,
            sourceAddress,
            data,
            tokenId,
            token,
            amount
        );
    }
}
