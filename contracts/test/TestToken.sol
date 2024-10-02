// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Test Token", "TTK") {
        _mint(msg.sender, initialSupply * (10 ** decimals())); // Mint initial supply to the deployer
    }
}
