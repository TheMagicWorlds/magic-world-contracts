import { expect } from "chai";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";
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

        // Mint tokens to accounts for voting
        await token.mint(accounts[1].address, ethers.parseEther("100"));
        await token.mint(accounts[2].address, ethers.parseEther("200"));
        await token.mint(accounts[3].address, ethers.parseEther("300"));

        // Create and sign delegation permits
        const domain = {
            name: await token.name(),
            version: '1',
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await token.getAddress()
        };

        const types = {
            Delegation: [
                { name: 'delegatee', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expiry', type: 'uint256' }
            ]
        };

        // Helper function to create and execute delegation permit
        async function delegateWithPermit(delegator: any, delegatee: string) {
            const nonce = await token.nonces(delegator.address);
            const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

            const value = {
                delegatee: delegatee,
                nonce: nonce,
                expiry: expiry
            };

            const signature = await delegator.signTypedData(domain, types, value);
            const { v, r, s } = ethers.Signature.from(signature);

            // Execute the gasless delegation
            await token.delegateBySig(
                delegatee,
                nonce,
                expiry,
                v,
                r,
                s
            );
        }

        // Execute gasless delegations
        await delegateWithPermit(accounts[1], accounts[1].address);
        await delegateWithPermit(accounts[2], accounts[2].address);
        await delegateWithPermit(accounts[3], accounts[3].address);

        // Add verification logs
        console.log("Delegation verification:");
        console.log("Account 1 voting power:",
            ethers.formatEther(await token.getVotes(accounts[1].address)));
        console.log("Account 2 voting power:",
            ethers.formatEther(await token.getVotes(accounts[2].address)));
        console.log("Account 3 voting power:",
            ethers.formatEther(await token.getVotes(accounts[3].address)));

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
            await mine(6);

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
            await mine(6);

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
            await mine(6);

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

    describe("Delegated Voting", () => {
        it("Should allow delegated voting through signatures and execution", async () => {
            const { governance, token, accounts } = await setupFixture();

            // Store proposal parameters for reuse
            const proposalParams = {
                targets: [accounts[1].address],
                values: [0],
                calldatas: ["0x"],
                description: "Proposal #1"
            };

            // Create proposal with stored parameters
            console.log("\nCreating proposal...");
            await governance.connect(accounts[1]).propose(
                proposalParams.targets,
                proposalParams.values,
                proposalParams.calldatas,
                proposalParams.description
            );

            const proposalId = await governance.hashProposal(
                proposalParams.targets,
                proposalParams.values,
                proposalParams.calldatas,
                ethers.keccak256(ethers.toUtf8Bytes(proposalParams.description))
            );
            console.log("Proposal ID:", proposalId);

            // Log initial state
            console.log("\nInitial proposal state:", await governance.state(proposalId));

            // Wait for voting delay
            await time.advanceBlock();
            await time.advanceBlock();
            console.log("Proposal state after delay:", await governance.state(proposalId));

            // Updated EIP-712 domain to match OpenZeppelin's Governor contract
            const domain = {
                name: "MagicWorldGovernance", //name of the contract
                version: "1", //version of the contract
                chainId: (await ethers.provider.getNetwork()).chainId, //chain id of the network
                verifyingContract: await governance.getAddress() //address of the contract
            };

            const types = {
                Ballot: [
                    { name: "proposalId", type: "uint256" },
                    { name: "support", type: "uint8" },
                    { name: "voter", type: "address" },
                    { name: "nonce", type: "uint256" }
                ]
            };

            // Helper function with enhanced debugging
            async function castVoteBySig(voter: any, proposalId: bigint, support: number) {
                // Get voter's nonce
                const voterNonce = await governance.nonces(voter.address);
                console.log("Voter nonce:", voterNonce);

                const value = {
                    proposalId: proposalId,
                    support: support,
                    voter: voter.address,
                    nonce: voterNonce
                };

                // Debug logs
                console.log("Voter voting power:",
                    ethers.formatEther(await token.getVotes(voter.address)));
                console.log("Signing value:", value);

                const signature = await voter.signTypedData(domain, types, value);
                const sig = ethers.Signature.from(signature);

                // Verify the signature
                const recoveredAddress = ethers.verifyTypedData(
                    domain,
                    types,
                    value,
                    signature
                );
                console.log("Signature verification:", {
                    recovered: recoveredAddress,
                    expected: voter.address,
                    matches: recoveredAddress.toLowerCase() === voter.address.toLowerCase()
                });

                // Cast vote using the signature
                const signatureBytes = ethers.concat([sig.r, sig.s, ethers.toBeArray(sig.v)]);
                await governance.castVoteBySig(
                    proposalId,
                    support,
                    voter.address,
                    signatureBytes
                );
            }

            // Cast votes
            console.log("\nCasting vote for account 2...");
            await castVoteBySig(accounts[2], proposalId, 1);

            console.log("\nCasting vote for account 3...");
            await castVoteBySig(accounts[3], proposalId, 1);

            // Log vote tallies
            const proposalVotes = await governance.proposalVotes(proposalId);
            console.log("\nVote tallies:");
            console.log("Against:", ethers.formatEther(proposalVotes[0]));
            console.log("For:", ethers.formatEther(proposalVotes[1]));
            console.log("Abstain:", ethers.formatEther(proposalVotes[2]));

            // Advance past voting period
            await mine(6);
            console.log("\nProposal state before execution:", await governance.state(proposalId));

            // Execute the proposal
            console.log("\nExecuting proposal...");
            await expect(governance.execute(
                proposalParams.targets,
                proposalParams.values,
                proposalParams.calldatas,
                ethers.keccak256(ethers.toUtf8Bytes(proposalParams.description))
            )).to.emit(governance, "ProposalExecuted")
                .withArgs(proposalId);

            // Verify final state
            const finalState = await governance.state(proposalId);
            console.log("Final proposal state:", finalState);
            expect(finalState).to.equal(7); // Executed state
        });
    });
}); 