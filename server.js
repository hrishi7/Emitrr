//basic express require
const express = require('express');
//redis cache require
const redis = require('redis');

//fs is for filesystem to read write the files
const fs = require("fs");
const https = require("https");

//below package is used to parse the metar data and response back JSON data
const parse = require('metar-parser');

//configuring ports
const PORT = process.env.PORT || 8080;
const REDIS_PORT = process.env.PORT || 6379;

const client = redis.createClient(REDIS_PORT);

//initialize express server
const app = express();

//below function is used to get the direction according to different wind direction with respect to different degree
 async function windDirection(num){
        if(num  <= 11.25 && num >=348.75 ){
            return 'N';
        } else if(num > 11.25 && num <=33.75){
            return 'NNE'
        } else if(num > 33.75  && num <=56.25){
            return 'NE'
        } else if(num > 56.25  && num <=78.75){
            return 'ENE'
        } else if(num > 78.75  && num <=101.25){
            return 'E'
        } else if(num > 101.25  && num <=123.75){
            return 'ESE'
        } else if(num > 123.75 && num <=146.25){
            return 'SE'
        } else if(num > 146.25 && num <=168.75){
            return 'SSE'
        } else if(num > 168.75 && num <=191.25){
            return 'S'
        } else if(num > 191.25 && num <=213.75){
            return 'SSW'
        } else if(num > 213.75 && num <=236.25){
            return 'SW'
        } else if(num > 236.25 && num <=258.75){
            return 'WSW'
        } else if(num > 258.75 && num <=281.25){
            return 'W'
        } else if(num > 281.25 && num <=303.75){
            return 'WNW'
        } else if(num > 303.75 && num <=326.25){
            return 'NW'
        } else if(num > 326.25 && num <=348.75){
            return 'NNW'
        }
 }

// Set response this function used to make that object in which format the user get easier to read the data and use it further
async function setResponse(res,data) {
    //calling a function to getting Wind direction from degree
let x = await windDirection(data.wind.direction);
  let innerObj = {};
  innerObj.station= data.station;
  innerObj.last_observation = data.time.date;
  innerObj.temperature = `${data.temperature.celsius } C ( ${data.temperature.fahrenheit} F)`
  innerObj.wind = x;
  innerObj.wind += ` at ${data.wind.speedMps} mps (${data.wind.speedKt} knots)`;
  let outerdata = {
      data: innerObj
  }
  res.send(outerdata);
}

async function getData(res,stationCode){
    //cretating atemp file to store the response of the request
    const file = fs.createWriteStream(`./data/${stationCode}.txt`);

    https.get(`https://tgftp.nws.noaa.gov/data/observations/metar/stations/${stationCode}.TXT`, response => {
    var stream = response.pipe(file);
    stream.on("finish", function() {
        // First I want to read the file
        fs.readFile(`./data/${stationCode}.txt`, 'utf-8', function read(err, data) {
            if (err) {
                throw err;
            }
            //parse the metar data from temp txt file using metar-parser package
            const parsed = parse(data);
             // Set data to Redis
            client.setex(stationCode, 300, JSON.stringify(parsed));
            //delete the temp txt file
            fs.unlinkSync(`./data/${stationCode}.txt`);
            // call another function to recontruct the response object as needed
            setResponse(res,parsed);

        });
    });
    });
}

// Make request to Github for data
async function getWeatherData(req, res, next) {
  try {
    console.log('Fetching Weather Data...');

    //getting station code from query url
    const { scode } = req.query;
    let stationCode = scode;

    //call function to fetch data from api server of nws
    getData(res,stationCode);
  } catch (err) {
    console.error(err);
    res.status(500);
  }
}

// Cache middleware to run it between request response lifecycle
function cache(req, res, next) {
  const { scode } = req.query;
  if(scode == undefined){
      //if scode is not given then give error message
      res.send({success:false, message:'Please provide a station code with parameter example \'?scode=KSGS\' at the end'})
  }else{
        let stationCode = scode;
        if ('nocache' in req.query){
            let s = req.query.nocache;
            if(s==1 ){
                //if nocache parameter is there then fetch live data and then update cache
                next();
            }
        }
        else{
            //then go to cache and get the data
            client.get(stationCode, async(err, data) => {
                if (err) throw err;

                if (data !== null) {
                    setResponse(res,JSON.parse(data));
                } else {
                    //if no cache data is there then fetch from server
                next();
                }
            });
        }
    }
}

// @route http://localhost:8080/metar/ping
// desc     use just as base route
// @access public
app.get('/metar/ping',(req, res)=>{
    res.json({"data":"pong"});
})

// @route http://localhost:8080/metar/info?scode=KHUL&nocache=1
// @route http://localhost:8080/metar/info?scode=KHUL
// desc     use to get weather data with specific stationCode
// @access public
app.get('/metar/info',cache, getWeatherData);


//starting the server
app.listen(8080, () => {
  console.log(`App listening on port ${PORT}`);
});