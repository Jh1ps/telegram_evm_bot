import ethers from 'ethers';
import express from 'express';
import chalk from 'chalk';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import web3 from 'web3'
import TokenData from './Contracts.js'
import bodyParser from 'body-parser'
import axios from 'axios'

const app = express();

app.use(bodyParser.json());

dotenv.config();

const data = {

  tokenIn: TokenData[process.env.TOKENIN].address, //tokenIn

  tokenInAbi: TokenData[process.env.TOKENIN].abi, //tokenInAbi

  tokenOut: TokenData[process.env.TOKENOUT].address, // token that you will purchase = BUSD for test '0xe9e7cea3dedca5984780bafc599bd69add087d56'

  AMOUNT_OF_TOKENS : process.env.AMOUNT_OF_TOKENS, // how much you want to buy/sell

  factory: TokenData[process.env.FACTORY].address,  //PantokenInSwap V2 factory

  router: TokenData[process.env.ROUTER].address, //PantokenInSwap V2 router

  recipient: process.env.YOUR_ADDRESS, //your wallet address,

  Slippage : process.env.SLIPPAGE, //in Percentage

  gasPrice : ethers.utils.parseUnits(`${process.env.GWEI}`, 'gwei'), //in gwei

  gasLimit : process.env.GAS_LIMIT, //at least 21000

  percentProfit : process.env.PERCENTPROFIT, //percent profit

  percentLoss : process.env.PERCENTLOSS, //percent loss

  minAmountOut : process.env.MIN_OUT, // min percentage to receive

  wss : process.env.WSS_NODE, //node url

  tokenTel : process.env.TELTOKEN, //telegram token

  Server_URL : process.env.SERVER_URL //server url
}

const mnemonic = process.env.YOUR_MNEMONIC 
const provider = new ethers.providers.WebSocketProvider(data.wss);
const wallet = new ethers.Wallet(mnemonic);
const account = wallet.connect(provider);
const TELEGRAM_API = `https://api.telegram.org/bot${data.tokenTel}`
const URI = `/webhook/${data.tokenTel}`
const WEBHOOK_URL = data.Server_URL + URI
var OrderSetted = false
var countResponses = 0
var messageSent = false
let confirmation = ""
let transaccion = ""
var takeProfit
var stopLoss
var tokenPrice
let priceMonitor
let messageResponse
let messageInterval



const router = new ethers.Contract(
  data.router,
  [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
  ],
  account
  );

async function monitoringPrices(){

  let amountOutMin = 0;
  let amounts;
  let tokenInPrice;


    //We buy x amount of the new token for our wbnb
    const amountIn = ethers.utils.parseUnits(`${data.AMOUNT_OF_TOKENS}`, 'ether');

    amounts = await router.getAmountsOut(amountIn, [data.tokenIn, data.tokenOut]);

    tokenInPrice = await router.getAmountsOut(ethers.utils.parseUnits('1', 'ether'), [data.tokenIn, data.tokenOut]);

    //amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));

    // Token amount to tokeout
    const tokenOutTotal = Math.round(web3.utils.fromWei(amounts[1].toString(), 'Ether') * 100) / 100

    tokenPrice = Math.round(web3.utils.fromWei(tokenInPrice[1].toString(), 'Ether') * 100) / 100

    if (tokenPrice < 1) {

      tokenPrice = web3.utils.fromWei(tokenInPrice[1].toString(), 'Ether') 

      tokenPrice = ((((tokenPrice * 0 ) / 100) + tokenPrice) * 100) / 100

    }

    if (takeProfit !== "" && OrderSetted == false) {

      // Set Take Profit
      takeProfit = Math.round((((tokenPrice * data.percentProfit) / 100) + tokenPrice) * 100) / 100

      // Set Stop Loss
      stopLoss = Math.round((((tokenPrice * data.percentLoss) / 100) + tokenPrice) * 100) / 100

      if (tokenPrice < 1) {
        // Set Take Profit
        takeProfit = (((tokenPrice * data.percentProfit) / 100) + tokenPrice) * 100 / 100

        // Set Stop Loss
        stopLoss = (((tokenPrice * data.percentLoss) / 100) + tokenPrice) * 100 / 100
      }

      OrderSetted = true

    }

    console.log(`
      Order Info
      =================
      tokenIn Info: ${data.tokenIn}
      tokenIn Price: ${tokenPrice} 
      tokenIn Amount: ${(amountIn * 1e-18).toString()} = ${tokenOutTotal} ${data.tokenOut}
      tokenMinAmount: ${amountOutMin}
      `);

    console.log("Token1 Price : " + tokenPrice + " / TP : " + takeProfit + " / SL : " + stopLoss)

    if(confirmation == 'C'){

      sendMessages(true)

      clearValues(true)

    }else if(confirmation == 'Y'){

      await placeOrder(amountIn, amountOutMin);

      sendMessages(true)

    }else if(confirmation == 'S'){

      await sendMessages(true);

      confirmation = ""

    }else if(confirmation !== "" && confirmation !== 'C'){

      takeProfit = parseFloat(takeProfit);

      try{ 

        takeProfit = parseFloat(takeProfit)
        takeProfit = (((takeProfit * parseFloat(confirmation)) / 100) + takeProfit) * 100 / 100            

      }catch(err){

        takeProfit = (((takeProfit * 5) / 100) + takeProfit) * 100 / 100

      }

      if(tokenPrice >= 1){

        takeProfit = (takeProfit).toFixed(3);

      }else{

        takeProfit = (takeProfit).toFixed(6);

      }

      await sendMessages(false);

      clearValues(false)

    }

    if(tokenPrice >= takeProfit || tokenPrice <= stopLoss) {

      if(tokenPrice <= stopLoss) {

        await placeOrder(amountIn, amountOutMin);

        await sendMessages(true);

      }else{

        if (messageSent !== true) {

          await sendMessages(false);

        }

    }

  }

}


async function placeOrder(amountIn, amountOutMin){

      console.log('Processing Transaction.....');

      clearValues(true);
      
      try{  
      // const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens( //uncomment this if you want to buy deflationary token
      const tx = await router.swapExactTokensForTokens( //uncomment here if you want to buy token
        amountIn,
        amountOutMin,
        [data.tokenIn,  data.tokenOut],
        data.recipient,
        Date.now() + 1000 * 60 * 5, //5 minutes
        {
          'gasLimit': data.gasLimit,
          'gasPrice': data.gasPrice,
            'nonce' : null //set you want buy at where position in blocks
          });

      const receipt = await tx.wait();

      console.log(`Transaction receipt : https://ftmscan.com/tx${receipt.logs[1].transactionHash}`);

      transaccion = `Transaction receipt : https://ftmscan.com/tx/${receipt.logs[1].transactionHash}`

    }catch(err){
      let error = JSON.parse(JSON.stringify(err));
      console.log(`Error caused by : 
      {
        reason : ${error.reason},
        transactionHash : ${error.transactionHash}
        message : ${error}
      }`);
      console.log(error);

      inquirer.prompt([
      {
        type: 'confirm',
        name: 'runAgain',
        message: 'Do you want to run again thi bot?',
      },
      ])
      .then(answers => {
        if(answers.runAgain === true){
          console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
          console.log('Run again');
          console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        }
        
    });

  }

}


async function sendMessages(isNotTP) {

  if(transaccion !== ""){

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: '1295823983',
    text: transaccion

    })

  }else{

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: '1295823983',
    text: "Price : " + tokenPrice + " / TP : " + takeProfit + " / SL : " + stopLoss + " , isLoss: " + isNotTP
    })

  } 

  if(isNotTP == false){

    confirmation = ""

    messageSent = true

  }

}


async function receiveMessages() {

  const res = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`)

  console.log(res.data)

  app.post(URI, async (req, res) => {

  confirmation = req.body.message.text

  console.log(confirmation)

  return res.send()

  })

}


function clearValues(clearData){

  if(clearData){
    OrderSetted = false
    messageSent = false
    confirmation = ""
    clearInterval(priceMonitor)
    clearInterval(messageInterval)   
    clearInterval(messageResponse)
    console.log("Clean everything")
  }else{
    messageSent = false
    console.log("Confirmation value is " + confirmation)
    confirmation = ""
  }

}

const PORT = 5001;

app.listen(PORT, console.log(chalk.yellow(`Listening for Liquidity Addition to token ${data.tokenOut}`)));

const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 40000 // 20 Seconds
priceMonitor = setInterval(async () => { await monitoringPrices() }, POLLING_INTERVAL)

messageResponse = setInterval(async () => { await receiveMessages() }, 20000)

messageInterval = setInterval(async () => { await sendMessages(true) }, 60 * 60 * 1000)

