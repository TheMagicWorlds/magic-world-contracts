# Magic World Contracts

This repository contains the smart contracts for the Magic World ecosystem - a decentralized platform that features token staking, rewards, and governance capabilities.

## Overview

Magic World is built on Ethereum using Solidity smart contracts, providing users with the ability to:

- Stake various whitelisted ERC20 tokens to earn rewards
- Participate in decentralized governance using the MAGIC governance token
- Create and vote on proposals to guide the platform's development

## Contract Architecture

The project consists of three core contracts:

1. **MagicWorldStaking**: A flexible staking platform for whitelisted tokens
2. **MagicWorldGovernanceToken**: The MAGIC token with voting capabilities
3. **MagicWorldGovernance**: The governance system for decentralized decision making

### Contract Relationships

```
MagicWorldGovernanceToken (MAGIC) <----- MagicWorldGovernance
         ↑                                      ↑
         |                                      |
         +--------------------------------------+
                           |
                           v
                   MagicWorldStaking
                   (reward token)
```


## Key Features

### MagicWorldStaking

A secure and flexible staking contract with the following features:

- **Multi-token Support**: Stake any whitelisted ERC20 token
- **Normalized Accounting**: All tokens are normalized to 18 decimals for consistent reward calculations
- **Configurable Staking Periods**: Each token can have its own minimum staking duration
- **Time-based Rewards**: Rewards accrue based on staking duration and amount
- **Anti-inflation Measures**: Prevents reward rate from being unsustainably high
- **Admin Controls**: Ability to whitelist/remove tokens and adjust parameters
- **Emergency Functions**: Includes safety measures like pause and emergency withdrawals

### MagicWorldGovernanceToken (MAGIC)

An ERC20 token with advanced governance capabilities:

- **Standard ERC20 Functionality**: Transfer, approve, etc.
- **ERC20Permit**: Supports gasless approvals via signatures
- **ERC20Votes**: Implements vote delegation and voting power tracking
- **Controlled Minting**: Only the owner can mint new tokens

### MagicWorldGovernance

A decentralized governance system utilizing OpenZeppelin's Governor contracts:

- **Proposal Creation**: Token holders can propose changes
- **Voting**: Simple majority voting mechanism
- **Configurable Parameters**:
  - Voting delay (time between proposal and voting)
  - Voting period (how long voting lasts)
  - Proposal threshold (minimum tokens needed to create a proposal)
- **Fixed Quorum**: Requires at least 4 MAGIC tokens for a valid vote

## Technical Implementation

### Staking System

The staking contract uses a reward-per-token approach where:

1. Rewards are distributed proportionally to the normalized amount staked
2. Each token is tracked separately but rewards are in a single reward token
3. Users can claim accumulated rewards at any time
4. Arithmetic underflow/overflow protections are implemented

### Governance System

The governance follows a standard proposal → vote → execute flow:

1. Token holders above the proposal threshold can create proposals
2. After the voting delay, eligible voters can cast votes (for, against, abstain)
3. If the proposal passes after the voting period, it can be executed

## Setup and Development

This project uses Hardhat for development, testing, and deployment.

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Ethereum wallet (MetaMask or similar)

### Installation

```bash
# Clone the repository
git clone https://github.com/TheMagicWorlds/magic-world-contracts.git
cd magic-world-contracts

# Install dependencies
npm install
```


### Compilation

```bash
npx hardhat compile
```


### Testing

```bash
npx hardhat test
```


### Deployment

```bash
# Deploy to local network
npx hardhat run scripts/deploy.js

# Deploy to a specific network (replace NETWORK_NAME)
npx hardhat run scripts/deploy.js --network NETWORK_NAME
```

## Usage Examples

### Staking Tokens

```javascript
// Approve the staking contract to spend your tokens
await erc20Token.approve(stakingContract.address, amount);

// Stake your tokens
await stakingContract.stake(erc20Token.address, amount);

// After the minimum staking period
await stakingContract.unstake(erc20Token.address, amount);

// Claim rewards
await stakingContract.claimRewards();
```


### Participating in Governance

```javascript
// Delegate your voting power (can delegate to yourself)
await magicToken.delegate(yourAddress);

// Create a proposal
const targets = [someContract.address];
const values = [0];
const calldatas = [someInterface.encodeFunctionData("functionName", [args])];
const description = "Proposal description";

await governance.propose(targets, values, calldatas, description);

// Vote on a proposal (1=For, 0=Against, 2=Abstain)
await governance.castVote(proposalId, 1);

// Execute a successful proposal
await governance.execute(targets, values, calldatas, descriptionHash);
```


## Security Considerations

- The staking contract includes protection against underflow/overflow in reward calculations
- Admin functions are protected with the Ownable pattern
- The system uses ReentrancyGuard to prevent reentrancy attacks
- Pause functionality is available for emergency situations

## License

This project is licensed under the MIT License - see the LICENSE file for details.
