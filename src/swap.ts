import Safe from "@safe-global/protocol-kit";
import {
  OrderBookApi,
  SupportedChainId,
  OrderQuoteSideKindSell,
  OrderQuoteRequest,
  SigningScheme,
} from "@cowprotocol/cow-sdk";
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
import ERC20_ABI from "./utils/abi/erc20";
import WETH_ABI from "./utils/abi/weth";
import { mainnet } from "viem/chains";
import { OperationType, MetaTransactionData } from "@safe-global/types-kit";

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

  const chainId = await publicClient.getChainId();

  const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const USDC_ADDRESS = "0xbe72E441BF55620febc26715db68d3494213D8Cb";
  const COWSWAP_GPv2VAULT_RELAYER_ADDRESS =
    "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
  const INPUT_AMOUNT = (0.02 * 10 ** 18).toString(); // 0.02 ETH

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
    `ETH balance before: ${await publicClient.getBalance({
      address: SAFE_ADDRESS as `0x${string}`,
    })}`
  );

  const wethBalanceBefore = await publicClient.readContract({
    abi: ERC20_ABI,
    address: WETH_ADDRESS,
    functionName: "balanceOf",
    args: [SAFE_ADDRESS],
  });

  console.log("WETH balance before: ", wethBalanceBefore);

  const usdcBalanceBefore = await publicClient.readContract({
    abi: ERC20_ABI,
    address: USDC_ADDRESS,
    functionName: "balanceOf",
    args: [SAFE_ADDRESS],
  });

  console.log("USDC balance before: ", usdcBalanceBefore);

  const safeTx = await protocolKit.createTransaction({
    transactions: [safeApproveTx], // safeDepositTx,
    onlyCalls: true,
  });

  const txResponse = await protocolKit.executeTransaction(safeTx);
  await publicClient.waitForTransactionReceipt({
    hash: txResponse.hash as `0x${string}`,
  });

  const quoteRequest: OrderQuoteRequest = {
    sellToken: WETH_ADDRESS,
    buyToken: USDC_ADDRESS,
    from: SAFE_ADDRESS,
    receiver: SAFE_ADDRESS,
    sellAmountBeforeFee: INPUT_AMOUNT,
    kind: OrderQuoteSideKindSell.SELL,
    signingScheme: SigningScheme.EIP1271,
  };

  const orderBookApi = new OrderBookApi({ chainId: SupportedChainId.SEPOLIA });
  const { quote } = await orderBookApi.getQuote(quoteRequest);

  console.log("Quote: ", quote);

  console.log(`Deposit and approve transaction: [${txResponse.hash}]`);

  const signature = "0x"; // TODO: Sign the order with the Safe signer

  const orderId = await orderBookApi.sendOrder({
    ...quote,
    signature: signature,
    signingScheme: SigningScheme.EIP1271,
  });

  console.log("Order ID: ", orderId);

  const order = await orderBookApi.getOrder(orderId);
  console.log("Order: ", order);

  const trades = await orderBookApi.getTrades({ orderUid: orderId });
  console.log("Trades: ", trades);

  console.log(
    `ETH balance after: ${await publicClient.getBalance({
      address: SAFE_ADDRESS as `0x${string}`,
    })}`
  );

  const wethBalanceAfter = await publicClient.readContract({
    abi: ERC20_ABI,
    address: WETH_ADDRESS,
    functionName: "balanceOf",
    args: [SAFE_ADDRESS],
  });

  console.log("WETH balance after: ", wethBalanceAfter);

  const usdcBalanceAfter = await publicClient.readContract({
    abi: ERC20_ABI,
    address: USDC_ADDRESS,
    functionName: "balanceOf",
    args: [SAFE_ADDRESS],
  });

  console.log("USDC balance after: ", usdcBalanceAfter);
};

// Execute the main function and catch any errors
main().catch((error) => {
  console.error("Error:", error);
});
