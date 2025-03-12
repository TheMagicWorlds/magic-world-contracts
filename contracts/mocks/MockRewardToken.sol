// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockRewardToken is ERC20, Ownable {
    constructor() ERC20("Reward Token", "RWD") Ownable(msg.sender) {}

    /**
     * @dev Creates new tokens and assigns them to the specified address
     * @param to Address to receive the newly minted tokens
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
