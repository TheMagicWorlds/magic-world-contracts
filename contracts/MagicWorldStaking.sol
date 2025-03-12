// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title MagicWorldStaking
 * @notice A secure staking contract for whitelisted ERC20 tokens with reward distribution
 * @dev Users can stake whitelisted tokens and earn rewards in a separate reward token
 */
contract MagicWorldStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Structs
    struct StakeInfo {
        uint256 amount; // Normalized amount (18 decimals)
        uint256 timestamp; // Last stake/reward claim timestamp
        uint256 rewardDebt; // Reward debt for reward calculation
    }

    struct TokenInfo {
        bool isWhitelisted;
        uint256 minStakeDuration;
        uint256 totalStaked; // Normalized amount (18 decimals)
    }

    // State variables
    IERC20 public immutable rewardToken; //the reward token for the staking contract
    uint256 public constant PRECISION = 1e18;

    // Track whitelisted tokens in an array for iteration
    address[] public whitelistedTokenList;
    mapping(address => uint256) private whitelistedTokenIndex; // token => index+1 (0 means not in list)
    mapping(address => mapping(address => StakeInfo)) public userStakes; // user => token => stake
    mapping(address => TokenInfo) public whitelistedTokens;

    uint256 public rewardPerTokenStored;
    uint256 public lastUpdateTime;
    uint256 public rewardRate;
    uint256 public totalNormalizedStaked; // Renamed from totalRewardPool for clarity
    uint256 public rewardsDuration = 7 days;
    uint256 public periodFinish;
    uint256 public totalAllocatedRewards; // Track allocated rewards

    // Events
    event TokenWhitelisted(address indexed token, uint256 minStakeDuration);
    event TokenRemovedFromWhitelist(address indexed token);
    event Staked(address indexed user, address indexed token, uint256 amount);
    event Unstaked(address indexed user, address indexed token, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardsFunded(uint256 amount);
    event MinStakeDurationUpdated(address indexed token, uint256 newDuration);

    /**
     * @dev Constructor sets the reward token and transfers ownership
     * @param _rewardToken Address of the reward token
     */
    constructor(address _rewardToken) Ownable(msg.sender) {
        require(_rewardToken != address(0), "Invalid reward token");
        rewardToken = IERC20(_rewardToken);
    }

    /**
     * @dev Updates reward state before any action
     */
    modifier updateReward(address account) {
        rewardPerTokenStored = _getRewardPerToken();
        lastUpdateTime = _lastTimeRewardApplicable();
        if (account != address(0)) {
            // Update user's rewards
            _updateUserRewards(account);
        }
        _;
    }

    /**
     * @dev Returns the last timestamp where rewards are applicable
     */
    function _lastTimeRewardApplicable() internal view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /**
     * @dev Internal function to calculate reward per token
     * @return Current reward per token value
     */
    function _getRewardPerToken() internal view returns (uint256) {
        if (totalNormalizedStaked == 0) return rewardPerTokenStored;

        return
            rewardPerTokenStored +
            (((_lastTimeRewardApplicable() - lastUpdateTime) *
                rewardRate *
                PRECISION) / totalNormalizedStaked);
    }

    /**
     * @dev Internal function to update user rewards
     * @param account User address to update rewards for
     */
    function _updateUserRewards(address account) internal {
        uint256 currentRewardPerToken = _getRewardPerToken();
        // Update rewardDebt for each token the user has staked
        for (uint i = 0; i < whitelistedTokenList.length; i++) {
            address token = whitelistedTokenList[i];
            StakeInfo storage _stake = userStakes[account][token];
            if (_stake.amount > 0) {
                uint256 newRewardDebt = (_stake.amount *
                    currentRewardPerToken) / PRECISION;

                // Safely calculate pendingReward to prevent underflow
                uint256 pendingReward;
                if (newRewardDebt > _stake.rewardDebt) {
                    pendingReward = newRewardDebt - _stake.rewardDebt;
                    // Safely add to totalAllocatedRewards to prevent overflow
                    totalAllocatedRewards += pendingReward;
                }

                // Update rewardDebt
                _stake.rewardDebt = newRewardDebt;
            }
        }
    }

    /**
     * @dev Stake tokens into the contract
     * @param token Address of the whitelisted token to stake
     * @param amount Amount of tokens to stake
     */
    function stake(
        address token,
        uint256 amount
    ) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        require(
            whitelistedTokens[token].isWhitelisted,
            "Token not whitelisted"
        );

        // Get token decimals and normalize amount
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        require(tokenDecimals <= 18, "Token decimals too high");
        uint256 normalizedAmount = amount * (10 ** (18 - tokenDecimals));

        // Update stake info
        StakeInfo storage userStake = userStakes[msg.sender][token];
        userStake.amount += normalizedAmount;
        userStake.timestamp = block.timestamp;

        // Update total staked
        whitelistedTokens[token].totalStaked += normalizedAmount;
        totalNormalizedStaked += normalizedAmount;

        // Transfer tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, token, amount);
    }

    /**
     * @dev Unstake tokens from the contract
     * @param token Address of the whitelisted token to unstake
     * @param amount Amount of tokens to unstake
     */
    function unstake(
        address token,
        uint256 amount
    ) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot unstake 0");

        StakeInfo storage userStake = userStakes[msg.sender][token];
        TokenInfo storage tokenInfo = whitelistedTokens[token];

        require(userStake.amount > 0, "No stake found");
        require(
            block.timestamp >= userStake.timestamp + tokenInfo.minStakeDuration,
            "Minimum stake duration not met"
        );

        // Get token decimals and normalize amount
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint256 normalizedAmount = amount * (10 ** (18 - tokenDecimals));
        require(userStake.amount >= normalizedAmount, "Insufficient stake");

        // Update stake info
        userStake.amount -= normalizedAmount;
        tokenInfo.totalStaked -= normalizedAmount;
        totalNormalizedStaked -= normalizedAmount;

        // Transfer tokens
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, token, amount);
    }

    /**
     * @dev View function to get pending rewards for a user
     * @param account User address to check rewards for
     */
    function getPendingRewards(address account) public view returns (uint256) {
        uint256 pending = 0;
        uint256 currentRewardPerToken = _getRewardPerToken();

        for (uint i = 0; i < whitelistedTokenList.length; i++) {
            address token = whitelistedTokenList[i];
            StakeInfo storage userStake = userStakes[account][token];
            if (userStake.amount > 0) {
                uint256 earnedRewards = (userStake.amount *
                    currentRewardPerToken) / PRECISION;
                if (earnedRewards > userStake.rewardDebt) {
                    pending += earnedRewards - userStake.rewardDebt;
                }
            }
        }

        return pending;
    }

    /**
     * @dev Claim accumulated rewards
     */
    function claimRewards() external nonReentrant whenNotPaused {
        // Update rewards state first to account for time elapsed
        updateRewards();

        uint256 pendingRewards = getPendingRewards(msg.sender);
        if (pendingRewards > 0) {
            // Reset user's reward debt across all their stakes
            for (uint256 i = 0; i < whitelistedTokenList.length; i++) {
                address token = whitelistedTokenList[i];
                StakeInfo storage userStake = userStakes[msg.sender][token];
                if (userStake.amount > 0) {
                    userStake.rewardDebt = calculateRewardDebt(
                        userStake.amount
                    );
                }
            }

            // Transfer rewards to user
            IERC20(rewardToken).safeTransfer(msg.sender, pendingRewards);
            emit RewardClaimed(msg.sender, pendingRewards);
        } else {
            revert("No rewards to claim");
        }
    }

    /**
     * @dev Fund the contract with reward tokens
     * @param amount Amount of reward tokens to add
     */
    function fundRewards(
        uint256 amount
    ) external onlyOwner updateReward(address(0)) {
        require(amount > 0, "Cannot fund with 0 tokens");

        uint256 oldBalance = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 newBalance = rewardToken.balanceOf(address(this));

        uint256 actualAmount = newBalance - oldBalance;

        // Handle existing rewards when adding new ones
        if (block.timestamp >= periodFinish) {
            // Previous reward period is over, start a new one
            rewardRate = actualAmount / rewardsDuration;
        } else {
            // Previous reward period is still active, adjust the rate
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (leftover + actualAmount) / rewardsDuration;
        }

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        totalAllocatedRewards += actualAmount;

        // Sanity check to prevent absurdly high reward rates
        require(
            rewardRate <=
                rewardToken.balanceOf(address(this)) / rewardsDuration,
            "Reward rate too high"
        );

        emit RewardsFunded(actualAmount);
    }

    /**
     * @dev Set the rewards duration
     * @param _rewardsDuration The new rewards duration in seconds
     */
    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        require(
            block.timestamp > periodFinish,
            "Previous rewards period must be complete"
        );
        require(
            _rewardsDuration > 0,
            "Reward duration must be greater than zero"
        );
        rewardsDuration = _rewardsDuration;
    }

    /**
     * @dev Add a token to the whitelist
     * @param token Token address to whitelist
     * @param minStakeDuration Minimum staking duration for this token
     */
    function addToken(
        address token,
        uint256 minStakeDuration
    ) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(whitelistedTokenIndex[token] == 0, "Token already whitelisted");
        require(minStakeDuration > 0, "Invalid stake duration");

        // Check token decimals
        uint8 decimals = IERC20Metadata(token).decimals();
        require(decimals <= 18, "Token decimals exceed 18");

        // Add to whitelist
        whitelistedTokens[token] = TokenInfo({
            isWhitelisted: true,
            minStakeDuration: minStakeDuration,
            totalStaked: 0
        });

        // Add to tracked array
        whitelistedTokenList.push(token);
        whitelistedTokenIndex[token] = whitelistedTokenList.length;

        emit TokenWhitelisted(token, minStakeDuration);
    }

    /**
     * @dev Remove a token from the whitelist
     * @param token Token address to remove
     */
    function removeToken(address token) external onlyOwner {
        uint256 index = whitelistedTokenIndex[token];
        require(index > 0, "Token not whitelisted");
        require(
            whitelistedTokens[token].totalStaked == 0,
            "Token still has stakes"
        );

        // Get the actual index (stored as index+1)
        index--;

        // Swap and pop to remove efficiently
        uint256 lastIndex = whitelistedTokenList.length - 1;
        if (index != lastIndex) {
            address lastToken = whitelistedTokenList[lastIndex];
            whitelistedTokenList[index] = lastToken;
            whitelistedTokenIndex[lastToken] = index + 1;
        }

        whitelistedTokenList.pop();
        delete whitelistedTokenIndex[token];
        delete whitelistedTokens[token];
        emit TokenRemovedFromWhitelist(token);
    }

    /**
     * @dev Update minimum stake duration for a token
     * @param token Token address to update
     * @param newDuration New minimum stake duration
     */
    function updateMinStakeDuration(
        address token,
        uint256 newDuration
    ) external onlyOwner {
        require(whitelistedTokenIndex[token] > 0, "Token not whitelisted");
        require(newDuration > 0, "Invalid stake duration");

        whitelistedTokens[token].minStakeDuration = newDuration;

        emit MinStakeDurationUpdated(token, newDuration);
    }

    /**
     * @dev Emergency withdraw excess rewards (owner only)
     */
    function emergencyWithdrawRewards() external onlyOwner {
        uint256 balance = rewardToken.balanceOf(address(this));
        uint256 excessAmount = balance > totalAllocatedRewards
            ? balance - totalAllocatedRewards
            : 0;

        if (excessAmount > 0) {
            rewardToken.safeTransfer(msg.sender, excessAmount);
        }
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Get count of whitelisted tokens
     */
    function getWhitelistedTokensCount() public view returns (uint256) {
        return whitelistedTokenList.length;
    }

    /**
     * @dev Get whitelisted token at index
     */
    function getWhitelistedTokenAtIndex(
        uint256 index
    ) public view returns (address) {
        require(index < whitelistedTokenList.length, "Index out of bounds");
        return whitelistedTokenList[index];
    }

    // Helper function to explicitly update rewards state
    function updateRewards() internal {
        uint256 currentTime = block.timestamp;
        if (currentTime <= lastUpdateTime) {
            return;
        }

        if (totalNormalizedStaked == 0) {
            lastUpdateTime = currentTime;
            return;
        }

        uint256 timeElapsed = currentTime - lastUpdateTime;
        uint256 rewards = timeElapsed * rewardRate;
        rewardPerTokenStored += (rewards * 1e18) / totalNormalizedStaked;
        lastUpdateTime = currentTime;
    }

    // Helper to calculate a user's reward debt based on current accumulated rewards
    function calculateRewardDebt(
        uint256 amount
    ) internal view returns (uint256) {
        return (amount * rewardPerTokenStored) / PRECISION;
    }
}
