import express from 'express'
import bodyParser from 'body-parser'
import rp from 'request-promise'
import Stellar from 'stellar-sdk'
const fs = require('fs')
const path = require('path')

var EventSource = require("eventsource");
var time = new Date().getTime()

const port = process.env.PORT || 4000
const app = express()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

var pagingToken = 0
/* Global Vars */
const server = new Stellar.Server('https://horizon-testnet.stellar.org')
const absPath1 = path.join(__dirname, 'key1.txt');
const absPath2 = path.join(__dirname, 'key2.txt');
let pairA = Stellar.Keypair.fromSecret(fs.readFileSync(absPath1, 'utf8'))
let pairB = Stellar.Keypair.fromSecret(fs.readFileSync(absPath2, 'utf8'))
let accountA, accountB = null // Load newly created account

loadLastPagingToken()
console.log(pagingToken)
var es = new EventSource(
  "https://horizon-testnet.stellar.org/accounts/" + pairB.publicKey() + "/payments?cursor=" + pagingToken,
);
var counter = 0;
es.onmessage = function (message) {
  var result = message.data ? JSON.parse(message.data) : message;
  counter+=1;
  console.log("New payment:");
  if(pagingToken<result['paging_token']){
    pagingToken=result['paging_token']
    savePagingToken(result['paging_token'])
  }
  if(result['to'] == pairB.publicKey()){
    console.log(result)
    console.log(counter+ "Time: ",new Date().getTime()-time)
  }

};
es.onerror = function (error) {
  console.log(error)
  console.log("An error occurred!");
};

// var accountId = "GC2BKLYOOYPDEFJKLKY6FNNRQMGFLVHJKQRGNSSRRGSMPGF32LHCQVGF";

// // Create an API call to query payments involving the account.
// var payments = server.payments().forAccount(accountId);

// // If some payments have already been handled, start the results from the
// // last seen payment. (See below in `handlePayment` where it gets saved.)
// var lastToken = loadLastPagingToken();
// if (lastToken) {
//   payments.cursor(lastToken);
// }

// // `stream` will send each recorded payment, one by one, then keep the
// // connection open and continue to send you new payments as they occur.
// payments.stream({
//   onmessage: function (payment) {
//     // Record the paging token so we can start from here next time.
//     savePagingToken(payment.paging_token);

//     // The payments stream includes both sent and received payments. We only
//     // want to process received payments here.
//     if (payment.to !== accountId) {
//       return;
//     }

//     // In Stellar’s API, Lumens are referred to as the “native” type. Other
//     // asset types have more detailed information.
//     var asset;
//     if (payment.asset_type === "native") {
//       asset = "lumens";
//     } else {
//       asset = payment.asset_code + ":" + payment.asset_issuer;
//     }

//     console.log(payment.amount + " " + asset + " from " + payment.from);
//   },

//   onerror: function (error) {
//     console.error("Error in payment stream");
//   },
// });

console.log(pairA.publicKey());

const createAccount = async (req, res) => {  

  let pairA = Stellar.Keypair.fromSecret('SAL7NAWLC5ZKVZ3M57Q5ANDB7RL73UZIOQYZ3AUG6K3GNACX7ZVUZNUY')

  await rp.get({
    uri: 'https://horizon-testnet.stellar.org/friendbot',
    qs: { addr: pairA.publicKey() },
    json: true
  })

  accountA = await server.loadAccount(pairA.publicKey())

  console.log('\nBalances for account: ' + pairA.publicKey())
  accountA.balances.forEach((balance) => {
    console.log('Type:', balance.asset_type, ', Balance:', balance.balance)
  })

}

async function pay(amountToPay){
  accountA = await server.loadAccount(pairA.publicKey())
  time = new Date().getTime()
  console.log(amountToPay)
  const transaction = new Stellar.TransactionBuilder(accountA,{fee: '100.0',networkPassphrase: 'Test SDF Network ; September 2015'})
    .addOperation(Stellar.Operation.payment({
      destination: pairB.publicKey(),
      asset: Stellar.Asset.native(),
      amount: '1.0'
    })).setTimeout(1000)
    .build()

  transaction.sign(pairA)

  console.log("\nXDR format of transaction: ", transaction.toEnvelope().toXDR('base64'))

  try {
    const transactionResult = await server.submitTransaction(transaction)
  } catch (err) {
    console.log(err)
  }

}
const makePayment = async (req, res) => {
  accountA = await server.loadAccount(pairA.publicKey())
  time = new Date().getTime()
  const transaction = new Stellar.TransactionBuilder(accountA,{fee: '100.0',networkPassphrase: 'Test SDF Network ; September 2015'})
    .addOperation(Stellar.Operation.payment({
      destination: pairB.publicKey(),
      asset: Stellar.Asset.native(),
      amount: '1.0'
    })).setTimeout(1000)
    .build()

  transaction.sign(pairA)

  console.log("\nXDR format of transaction: ", transaction.toEnvelope().toXDR('base64'))

  try {
    const transactionResult = await server.submitTransaction(transaction)
    
    res.send("Transaction successful!")
  } catch (err) {
    console.log('An error has occured:')
    console.log(err)
    res.send("Transaction failed")
  }
}

const getHistory = async (req, res) => {
  // Retrieve latest transaction
  let historyPage = await server.transactions()
    .forAccount(accountA.accountId())
    .call()

  console.log(`\n\nHistory for public key ${pairA.publicKey()} with accountID ${accountA.accountId()}:`)
  
  let hasNext = true
  while(hasNext) {
    if(historyPage.records.length === 0) {
      console.log("\nNo more transactions!")
      hasNext = false
    } else {
      // Print tx details and retrieve next historyPage
      console.log("\nSource account: ", historyPage.records[0].source_account)
      let txDetails = Stellar.xdr.TransactionEnvelope.fromXDR(historyPage.records[1].envelope_xdr, 'base64')
      console.log(historyPage)
      txDetails._attributes.tx._attributes.operations.map(operation => console.log(`Transferred amount: ${operation._attributes.body._value._attributes.amount.low} XLM`))
      historyPage = await historyPage.next()
    }
  }

  res.send("History retrieved successful!")
}
function savePagingToken() {

  const absPath = path.join(__dirname, 'pagingToken.txt');
  try {
    fs.writeFileSync(absPath, pagingToken)
  } catch (err) {
    console.error(err)
  }
}

function loadLastPagingToken() {
  const absPath = path.join(__dirname, 'pagingToken.txt');
  pagingToken = fs.readFileSync(absPath, 'utf8')
}
/* CORS */
app.use((req, res, next) => {
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'Origin,X-Requested-With,content-type')

  // Pass to next layer of middleware
  next()
})



/* API Routes */
app.post('/', createAccount)
app.post('/payment', makePayment)
app.get('/getHistory', getHistory)

/* Serve API */
var instance = app.listen(port, () => {
  console.log(`Stellar test app listening on port ${port}!`)
})

var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
var waitForUserInput = function() {
  rl.question("", function(answer) {
    var args = answer.split(' ')
    if (args[0] == "pay"){
        if(pay(args[1])!=2){
          waitForUserInput();
        }
    } else {
        waitForUserInput();
    }
  });
}
waitForUserInput();