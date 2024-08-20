exports.handler = async function(event) {
    const {
        Keypair,
        Contract,
        SorobanRpc,
        TransactionBuilder,
        Networks,
        BASE_FEE,
    } = require("@stellar/stellar-sdk");

    const { secrets = {} } = event;

    const sourceSecret = secrets.SOURCE_ACCOUNT_SECRET || 'SOURCE-SECRET';
    const sorobanRpcUrl = secrets.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org:443";
    const contractAddress = secrets.CONTRACT_ADDRESS || 'CBFQXUAWSBVHKJPSLYTZJAJ2V2N4PLIO65LU5CEKZJ6N2GLQPCV3CIPK';

    if (!sourceSecret || !sorobanRpcUrl || !contractAddress) {
        throw new Error("Missing required secrets");
    }

    try {
        const sourceKeypair = Keypair.fromSecret(sourceSecret);
        const server = new SorobanRpc.Server(sorobanRpcUrl);
        const contract = new Contract(contractAddress);

        const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

        let builtTransaction = new TransactionBuilder(sourceAccount, {
            fee: BASE_FEE,
            networkPassphrase: Networks.TESTNET,
        })
            .addOperation(
                contract.call(
                    "increment"
                ),
            )
            .setTimeout(30)
            .build();

        console.log('Transaction built:', builtTransaction.toXDR());

        let preparedTransaction = await server.prepareTransaction(builtTransaction);
        console.log('Transaction prepared:', preparedTransaction);

        preparedTransaction.sign(sourceKeypair);

        let signedXDR = preparedTransaction.toEnvelope().toXDR("base64");
        console.log('Signed prepared transaction XDR:', signedXDR);

        let sendResponse = await server.sendTransaction(preparedTransaction);
        console.log('Transaction sent:', JSON.stringify(sendResponse));

        if (sendResponse.status === "PENDING") {
            let getResponse;
            do {
                console.log("Waiting for transaction confirmation...");
                await new Promise((resolve) => setTimeout(resolve, 1000));
                getResponse = await server.getTransaction(sendResponse.hash);
            } while (getResponse.status === "NOT_FOUND");

            console.log('Transaction response:', JSON.stringify(getResponse));

            if (getResponse.status === "SUCCESS") {
                if (!getResponse.resultMetaXdr) {
                    throw new Error("Empty resultMetaXDR in getTransaction response");
                }
                let transactionMeta = getResponse.resultMetaXdr;
                let returnValue = transactionMeta.v3().sorobanMeta().returnValue();
                console.log('Transaction result:', returnValue.value());
            } else {
                throw new Error(`Transaction failed: ${getResponse.resultXdr}`);
            }
        } else {
            throw new Error(sendResponse.errorResultXdr);
        }
    } catch (err) {
        console.log("Sending transaction failed", JSON.stringify(err, null, 2));
    }
};