import Safe from "@safe-global/protocol-kit";
import * as dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import WETH_ABI from "./utils/abi/weth";
import { mainnet } from "viem/chains";
import { OperationType, MetaTransactionData } from "@safe-global/types-kit";
import { COWSWAP_GPv2VAULT_RELAYER_ADDRESS, INPUT_AMOUNT, WETH_ADDRESS } from "./conts";

// Load environment variables from .env file
dotenv.config();

const main = async () => {
  // Destructure environment variables
  const { SAFE_ADDRESS, SIGNER_PRIVATE_KEY, RPC_URL } = process.env;

  // Check if all required environment variables are present
  if (!SAFE_ADDRESS || !SIGNER_PRIVATE_KEY || !RPC_URL) {
    throw new Error("Missing environment variables in .env file");
  }

  const customChain = defineChain({
    ...mainnet,
    name: "custom chain",
    transport: http(RPC_URL),
  });

  const account = privateKeyToAccount(SIGNER_PRIVATE_KEY as `0x${string}`);

  // Set up viem clients and accounts
  const publicClient = createPublicClient({
    transport: http(RPC_URL!),
    chain: customChain,
  });
  const walletClient = createWalletClient({
    transport: http(RPC_URL!),
    chain: customChain,
  });

  const protocolKit = await Safe.init({
    provider: RPC_URL,
    signer: SIGNER_PRIVATE_KEY,
    safeAddress: SAFE_ADDRESS,
  });

  const isSafeDeployed = await protocolKit.isSafeDeployed(); // True

  if (!isSafeDeployed) {
    throw new Error("Safe not deployed");
  }

  const callDataDeposit = encodeFunctionData({
    abi: WETH_ABI,
    functionName: "deposit",
    args: [],
  });

  // Exchange ETH to WETH
  const safeDepositTx: MetaTransactionData = {
    to: WETH_ADDRESS,
    value: INPUT_AMOUNT,
    data: callDataDeposit,
    operation: OperationType.Call,
  };

  const wethInstance = getContract({
    address: WETH_ADDRESS,
    abi: WETH_ABI,
    client: publicClient,
  });

  const callDataApprove = encodeFunctionData({
    abi: WETH_ABI,
    functionName: "approve",
    args: [COWSWAP_GPv2VAULT_RELAYER_ADDRESS, INPUT_AMOUNT],
  });

  const safeApproveTx: MetaTransactionData = {
    to: WETH_ADDRESS,
    value: "0",
    data: callDataApprove,
    operation: OperationType.Call,
  };

  console.log(
    `ETH balance before: [${await publicClient.getBalance({
      address: SAFE_ADDRESS as `0x${string}`,
    })}]`
  );

  console.log(`WETH balance before [${await wethInstance.read.balanceOf([SAFE_ADDRESS])}]`);

  const safeTx = await protocolKit.createTransaction({
    transactions: [safeDepositTx, safeApproveTx],
    onlyCalls: true,
  });

  const txResponse = await protocolKit.executeTransaction(safeTx);
  await publicClient.waitForTransactionReceipt({
    hash: txResponse.hash as `0x${string}`,
  });

  console.log(`Transaction executed successfully [${txResponse.hash}]`);

  console.log(`WETH balance after [${await wethInstance.read.balanceOf([SAFE_ADDRESS])}]`);

  console.log(
    `ETH balance after: [${await publicClient.getBalance({
      address: SAFE_ADDRESS as `0x${string}`,
    })}]`
  );

};

// Execute the main function and catch any errors
main().catch((error) => {
  console.error("Error:", error);
});
