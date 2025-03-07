// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract MagicWorldGovernance is
    Governor,
    GovernorCountingSimple,
    GovernorVotes
{
    uint256 private immutable _votingDelay;
    uint256 private immutable _votingPeriod;
    uint256 private immutable _proposalThreshold;

    constructor(
        IVotes _token,
        uint256 initialVotingDelay,
        uint256 initialVotingPeriod,
        uint256 initialProposalThreshold
    ) Governor("MagicWorldGovernance") GovernorVotes(_token) {
        _votingDelay = initialVotingDelay;
        _votingPeriod = initialVotingPeriod;
        _proposalThreshold = initialProposalThreshold;
    }

    function quorum(uint256) public pure override returns (uint256) {
        return 4e18;
    }

    function votingDelay() public view override returns (uint256) {
        return _votingDelay;
    }

    function votingPeriod() public view override returns (uint256) {
        return _votingPeriod;
    }

    function proposalThreshold() public view override returns (uint256) {
        return _proposalThreshold;
    }

    // This function returns the executor (this contract itself)
    function _executor() internal view override returns (address) {
        return address(this);
    }
}
