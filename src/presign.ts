import {
  SupportedChainId,
  OrderKind,
  TradeParameters,
  TradingSdk,
  SwapAdvancedSettings,
  SigningScheme,
} from "@cowprotocol/cow-sdk";
import { jsonReplacer } from "./utils/utils";
import * as dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import Safe, { SafeProvider } from "@safe-global/protocol-kit";
import { Signer, VoidSigner } from "ethers";

// Load environment variables from .env file
dotenv.config();

const { SAFE_ADDRESS, SIGNER_PRIVATE_KEY, RPC_URL } = process.env;
const INPUT_AMOUNT = (0.02 * 10 ** 18).toString(); // 0.02 ETH

export async function run() {

// Check if all required environment variables are present
  if (!SAFE_ADDRESS || !SIGNER_PRIVATE_KEY || !RPC_URL) {
    throw new Error("Missing environment variables in .env file");
  }
  
  const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const COW_ADDRESS = "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59";
  const APP_CODE = "swap-n-bridge";

  const protocolKit = await Safe.init({
    provider: RPC_URL ,
    signer: SIGNER_PRIVATE_KEY,
    safeAddress: SAFE_ADDRESS,
  });

  const safeProvider = protocolKit.getSafeProvider();

  // Initialize the SDK with the wallet
  const sdk = new TradingSdk({
    chainId: SupportedChainId.SEPOLIA,
    signer: new VoidSigner(SAFE_ADDRESS),
    appCode: APP_CODE,
  });

  // Define trade parameters
  console.log("Presign (for smart contract wallet, typically)");
  const parameters: TradeParameters = {
    kind: OrderKind.SELL, // Sell
    amount: INPUT_AMOUNT, // 0.02 WETH
    sellToken: WETH_ADDRESS,
    sellTokenDecimals: 18,
    buyToken: COW_ADDRESS, // For COW
    buyTokenDecimals: 18,
    slippageBps: 50,
  };

  const advancedParameters: SwapAdvancedSettings = {
    quoteRequest: {
      // Specify the signing scheme
      from: SAFE_ADDRESS,
      signingScheme: SigningScheme.PRESIGN,
    },
  };

  // Specify the smart contract (works with EOA too, but there's no much point on doing that, other than for this test)
  const smartContractWalletAddress = SAFE_ADDRESS as string; // Pretend the EOA is the Smart Contract Wallet, normally it won't be
  console.log(
    "\n1. In pre-sign flow, we first post the order (but the order is not signed yet)"
  );
  const orderId = await sdk.postSwapOrder(parameters, advancedParameters);
  console.log(
    `Order created, id: https://explorer.cow.fi/sepolia/orders/${orderId}?tab=overview`
  );

  console.log(
    "\n2. We get the pre-sign unsigned transaction (transaction that if executed, would sign the order with the smart contract wallet)"
  );
  const preSignTransaction = await sdk.getPreSignTransaction({
    orderId,
    account: smartContractWalletAddress,
  });

  console.log("preSignTransaction", preSignTransaction);

  console.log(
    `Pre-sign unsigned transaction: ${JSON.stringify(
      preSignTransaction,
      jsonReplacer,
      2
    )}`
  );

  const customChain = defineChain({
    ...sepolia,
    name: "custom chain",
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    transport: http(RPC_URL!),
    chain: customChain,
  });

  const publicClient = createPublicClient({
    chain: customChain,
    transport: http(RPC_URL),
  });

  const account = privateKeyToAccount(SIGNER_PRIVATE_KEY as `0x${string}`);

  // Send tx using viem
  console.log("\n3. Sign and send to Ethereum the pre-sign transaction");
  const transactionHash = await walletClient.sendTransaction({
    account: account,
    to: preSignTransaction.to as `0x${string}`,
    value: BigInt(preSignTransaction.value),
    data: preSignTransaction.data as `0x${string}`,
    chain: customChain,
  });

  console.log(`Sent tx: ${transactionHash}`);
  console.log("\n4. Wait for the tx to be mined");
  await publicClient.waitForTransactionReceipt({ hash: transactionHash });
}

run().catch((error) => {
  console.error(error);
});
