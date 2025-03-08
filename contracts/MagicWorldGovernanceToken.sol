// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";


contract MagicWorldGovernanceToken is ERC20Permit, ERC20Votes {
    address public owner;

    constructor()
        ERC20("Magic World Governance Token", "MAGIC")
        ERC20Permit("Magic World Governance Token")
    {
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "Only owner can mint");
        _mint(to, amount);
    }

    // Override required functions
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Votes) {
        super._update(from, to, amount);
    }

    function nonces(
        address account
    ) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(account);
    }

    // Add gasless delegation function
    function delegateBySig(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override {
        super.delegateBySig(delegatee, nonce, expiry, v, r, s);
    }
}
