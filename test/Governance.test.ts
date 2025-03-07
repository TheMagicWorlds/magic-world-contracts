import { expect } from "chai";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { MagicWorldGovernance, MagicWorldGovernanceToken } from "../typechain-types";

describe("MagicWorldGovernance", () => {
    const setupFixture = deployments.createFixture(async () => {
        await deployments.fixture();
        const signers = await getNamedAccounts();
        const accounts = await ethers.getSigners();

        // Deploy Governance Token
        const token = await ethers.deployContract(
            "MagicWorldGovernanceToken",
            [],
            await ethers.getSigner(signers.deployer)
        ) as MagicWorldGovernanceToken;
        console.log("Token Address:", await token.getAddress());

        // Deploy Governance Contract with REDUCED voting period for testing
        const votingDelay = 1; // 1 block
        const votingPeriod = 5; // Reduced from 50400 to 5 blocks for testing
        const proposalThreshold = 0;

        const governance = await ethers.deployContract(
            "MagicWorldGovernance",
            [
                await token.getAddress(),
                votingDelay,
                votingPeriod,
                proposalThreshold
            ],
            await ethers.getSigner(signers.deployer)
        ) as MagicWorldGovernance;
        console.log("Governance Address:", await governance.getAddress());

        // Mint and delegate tokens to accounts for voting
        await token.mint(accounts[1].address, ethers.parseEther("100"));
        await token.mint(accounts[2].address, ethers.parseEther("200"));
        await token.mint(accounts[3].address, ethers.parseEther("300"));

        // Delegate voting power (must be called to enable voting)
        await token.connect(accounts[1]).delegate(accounts[1].address);
        await token.connect(accounts[2]).delegate(accounts[2].address);
        await token.connect(accounts[3]).delegate(accounts[3].address);

        return { governance, token, accounts };
    });

    describe("Initialization", () => {
        it("Should initialize with correct settings", async () => {
            const { governance } = await setupFixture();
            expect(await governance.name()).to.equal("MagicWorldGovernance");
            expect(await governance.quorum(0)).to.equal(ethers.parseEther("4"));
            expect(await governance.votingDelay()).to.equal(1);
            expect(await governance.votingPeriod()).to.equal(5);
            expect(await governance.proposalThreshold()).to.equal(0);
        });
    });

    describe("Proposal Creation", () => {
        it("Should allow proposal creation", async () => {
            const { governance, accounts } = await setupFixture();
            await expect(
                governance.connect(accounts[1]).propose(
                    [accounts[1].address],
                    [0],
                    ["0x"],
                    "Proposal #1"
                )
            ).to.emit(governance, "ProposalCreated");
        });
    });

    describe("Voting", () => {
        it("Should allow voting during active proposal period", async () => {
            const { governance, accounts } = await setupFixture();

            // Create proposal
            await governance.connect(accounts[1]).propose(
                [accounts[1].address],
                [0],
                ["0x"],
                "Proposal #1"
            );

            // Get proposal ID
            const proposalId = await governance.hashProposal(
                [accounts[1].address],
                [0],
                ["0x"],
                ethers.keccak256(ethers.toUtf8Bytes("Proposal #1"))
            );

            // Advance time past voting delay
            await time.increase(2);

            // Cast vote (1 = For)
            await expect(governance.connect(accounts[1]).castVote(proposalId, 1))
                .to.emit(governance, "VoteCast");
        });
    });

    describe("Proposal Execution", () => {
        it("Should execute a successful proposal", async () => {
            const { governance, accounts } = await setupFixture();

            // Create proposal
            const proposalTx = await governance.connect(accounts[1]).propose(
                [accounts[1].address],
                [0],
                ["0x"],
                "Proposal #1"
            );

            // Get the proposal ID
            const proposalId = await governance.hashProposal(
                [accounts[1].address],
                [0],
                ["0x"],
                ethers.keccak256(ethers.toUtf8Bytes("Proposal #1"))
            );

            // Log initial state
            console.log("Initial state:", await governance.state(proposalId));

            // Wait for voting delay
            await time.advanceBlock();
            await time.advanceBlock();

            // Log active state
            console.log("After delay state:", await governance.state(proposalId));

            // Cast votes
            await governance.connect(accounts[1]).castVote(proposalId, 1);
            await governance.connect(accounts[2]).castVote(proposalId, 1);
            await governance.connect(accounts[3]).castVote(proposalId, 1);

            // Advance blocks past voting period (5 blocks)
            await time.advanceBlockTo((await ethers.provider.getBlockNumber()) + 6);

            // Log final state
            console.log("Before execution state:", await governance.state(proposalId));

            // Execute proposal
            await expect(governance.execute(
                [accounts[1].address],
                [0],
                ["0x"],
                ethers.keccak256(ethers.toUtf8Bytes("Proposal #1"))
            )).to.emit(governance, "ProposalExecuted");
        });

        it("Should not execute a defeated proposal", async () => {
            const { governance, accounts } = await setupFixture();

            // Create proposal
            await governance.connect(accounts[1]).propose(
                [accounts[1].address],
                [0],
                ["0x"],
                "Proposal #2"
            );

            // Get the proposal ID
            const proposalId = await governance.hashProposal(
                [accounts[1].address],
                [0],
                ["0x"],
                ethers.keccak256(ethers.toUtf8Bytes("Proposal #2"))
            );

            // Log initial state
            console.log("Initial state:", await governance.state(proposalId));

            // Wait for voting delay
            await time.advanceBlock();
            await time.advanceBlock();

            // Cast votes (accounts[1] votes for, accounts[2] and accounts[3] vote against)
            // Remember: account[1] has 100 tokens, account[2] has 200, account[3] has 300
            await governance.connect(accounts[1]).castVote(proposalId, 1); // For
            await governance.connect(accounts[2]).castVote(proposalId, 0); // Against
            await governance.connect(accounts[3]).castVote(proposalId, 0); // Against

            // Advance blocks past voting period (5 blocks)
            await time.advanceBlockTo((await ethers.provider.getBlockNumber()) + 6);

            // Log final state
            console.log("Final state:", await governance.state(proposalId));

            // Attempt to execute proposal (should fail)
            await expect(
                governance.execute(
                    [accounts[1].address],
                    [0],
                    ["0x"],
                    ethers.keccak256(ethers.toUtf8Bytes("Proposal #2"))
                )
            ).to.be.revertedWithCustomError(
                governance,
                "GovernorUnexpectedProposalState"
            );
        });
    });

    describe("Edge Cases", () => {
        it("Should handle non-existent proposal retrieval", async () => {
            const { governance } = await setupFixture();
            await expect(governance.state(999)).to.be.reverted;
        });

        it("Should reject voting on non-active proposals", async () => {
            const { governance, accounts } = await setupFixture();

            // Create proposal
            const proposeTx = await governance.connect(accounts[1]).propose(
                [accounts[1].address],
                [0],
                ["0x"],
                "Proposal #1"
            );

            // Get proposal ID
            const proposalId = await governance.hashProposal(
                [accounts[1].address],
                [0],
                ["0x"],
                ethers.keccak256(ethers.toUtf8Bytes("Proposal #1"))
            );

            // Enhanced logging for debugging
            console.log("Proposal created at block:", await ethers.provider.getBlockNumber());
            console.log("Initial state:", await governance.state(proposalId));
            console.log("Voting Delay:", await governance.votingDelay());
            console.log("Voting Period:", await governance.votingPeriod());

            // Try to vote before voting delay (should be in Pending state)
            await expect(
                governance.connect(accounts[1]).castVote(proposalId, 1)
            ).to.be.revertedWithCustomError(governance, "GovernorUnexpectedProposalState");

            // Advance past voting period
            const currentBlock = await ethers.provider.getBlockNumber();
            console.log("Current block before advance:", currentBlock);

            // Advance through voting period (voting delay + voting period + 1)
            await time.advanceBlockTo(currentBlock + 7);

            console.log("Current block after advance:", await ethers.provider.getBlockNumber());
            console.log("Final state:", await governance.state(proposalId));

            // Try to vote after voting period (should be in Defeated/Succeeded state)
            await expect(
                governance.connect(accounts[1]).castVote(proposalId, 1)
            ).to.be.revertedWithCustomError(governance, "GovernorUnexpectedProposalState");
        });
    });

    describe("Proposal Events and Logs", () => {
        it("Should emit trackable events for proposal lifecycle", async () => {
            const { governance, accounts } = await setupFixture();

            // Create proposal and capture the transaction
            const proposeTx = await governance.connect(accounts[1]).propose(
                [accounts[1].address],
                [0],
                ["0x"],
                "Proposal #3"
            );
            const proposeReceipt = await proposeTx.wait();

            // Get proposal ID from ProposalCreated event
            const proposalCreatedEvent = proposeReceipt?.logs.find(
                log => {
                    try {
                        const parsed = governance.interface.parseLog(log as any);
                        return parsed?.name === "ProposalCreated";
                    } catch (e) {
                        return false;
                    }
                }
            );
            const proposalId = proposalCreatedEvent ?
                governance.interface.parseLog(proposalCreatedEvent as any)?.args[0] :
                null;

            expect(proposalId).to.not.be.null;

            // Wait for voting delay
            await time.advanceBlock();
            await time.advanceBlock();

            // Cast votes and capture vote events
            const vote1Tx = await governance.connect(accounts[1]).castVote(proposalId, 1);
            const vote2Tx = await governance.connect(accounts[2]).castVote(proposalId, 0);
            const vote3Tx = await governance.connect(accounts[3]).castVote(proposalId, 0);

            const vote1Receipt = await vote1Tx.wait();
            const vote2Receipt = await vote2Tx.wait();
            const vote3Receipt = await vote3Tx.wait();

            // Collect all vote events
            const voteEvents = [vote1Receipt, vote2Receipt, vote3Receipt]
                .flatMap(receipt => receipt?.logs || [])
                .filter(log => {
                    try {
                        const parsed = governance.interface.parseLog(log as any);
                        return parsed?.name === "VoteCast";
                    } catch (e) {
                        return false;
                    }
                })
                .map(log => governance.interface.parseLog(log as any));

            // Calculate vote tallies from events
            const voteTally = voteEvents.reduce((tally, event) => {
                if (!event || !event.args) return tally;
                const weight = event.args.weight;
                const support = event.args.support;
                if (support === 1n) {
                    tally.for += weight;
                } else if (support === 0n) {
                    tally.against += weight;
                }
                return tally;
            }, { for: 0n, against: 0n });

            // Advance blocks past voting period
            await time.advanceBlockTo((await ethers.provider.getBlockNumber()) + 6);

            // Get final state
            const finalState = await governance.state(proposalId);

            // Verify our event-based tally matches the outcome
            expect(voteTally.against).to.be.greaterThan(voteTally.for);
            expect(finalState).to.equal(3); // 3 represents Defeated state

            // Log the proposal analytics
            console.log("Proposal Analytics:");
            console.log("Total Votes For:", ethers.formatEther(voteTally.for));
            console.log("Total Votes Against:", ethers.formatEther(voteTally.against));
            console.log("Voter Addresses:", voteEvents.map(e => e?.args?.voter || null).filter(Boolean));
            console.log("Final State:", finalState);

            // Verify specific vote weights
            expect(voteTally.for).to.equal(ethers.parseEther("100")); // Account 1's votes
            expect(voteTally.against).to.equal(ethers.parseEther("500")); // Account 2 + 3's votes
        });
    });
}); 