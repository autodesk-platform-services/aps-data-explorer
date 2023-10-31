import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import axios from "axios";
import cookieSession from "cookie-session";
import { url } from "inspector";

import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({ extended: false })

let app = express();

app.use(
  cookieSession({
    name: "aps_session",
    keys: ["aps_secure_key"],
    maxAge: 60 * 60 * 1000 // 1 hour like the token (changes to cookie content resets the timer)
  })
);

let clientId = process.env.APS_CLIENT_ID || "YOUR CLIENT ID";
let clientSecret = process.env.APS_CLIENT_SECRET || "YOUR CLIENT SECRET";
let serverPort = process.env.PORT || 3000;
let serverUrl = process.env.BASE_URL || "http://localhost:" + serverPort;
let callbackUrl = process.env.APS_CALLBACK_URL || `${serverUrl}/callback/oauth`;
const apsUrl = process.env.APS_BASE_URL || "https://developer.api.autodesk.com"; 
let dataEndpoint = process.env.APS_DATA_ENDPOINT;

app.get("/callback/oauth", async (req, res) => {
  console.log("/callback/oauth", req.session);

  const { code, state } = req.query;

  try {
    let cId = req.session.client_id ? req.session.client_id : clientId;
    let cSecret = req.session.client_secret ? req.session.client_secret : clientSecret;
    let cApsUrl = req.session.apsUrl ? req.session.apsUrl : apsUrl;
    const clientIdSecret = btoa(`${cId}:${cSecret}`);
    const response = await axios({
      method: "POST",
      url: `${cApsUrl}/authentication/v2/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + clientIdSecret
      },
      data: `grant_type=authorization_code&code=${code}&redirect_uri=${callbackUrl}`
    });

    req.session = req.session || {};
    req.session.access_token = response.data.access_token;
    req.session.refresh_token = response.data.refresh_token;

    res.redirect(`/` + (state ? `${state}` : ""));
  } catch (error) {
    console.log(error);
    res.end();
  }
});

app.get("/oauth/token2LO", async (req, res) => {
  console.log("/oauth/token2LO", req.session);
  let cId = req.session.client_id ? req.session.client_id : clientId;
  let cSecret = req.session.client_secret ? req.session.client_secret : clientSecret;
  let cApsUrl = req.session.apsUrl ? req.session.apsUrl : apsUrl;
  const clientIdSecret = btoa(`${cId}:${cSecret}`);
  const response = await axios({
    method: "POST",
    url: `${cApsUrl}/authentication/v2/token`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + clientIdSecret
    },
    data: `grant_type=client_credentials&scope=data:read data:write data:create data:search`
  }); 
  
  res.end(response.data.access_token);
})

app.get("/oauth/token", async (req, res) => {
  console.log("/oauth/token", req.session);

  if (req.query.refresh) {
    try {
      let cId = req.session.client_id ? req.session.client_id : clientId;
      let cSecret = req.session.client_secret ? req.session.client_secret : clientSecret;
      let cApsUrl = req.session.apsUrl ? req.session.apsUrl : apsUrl;
      let rToken = req.session.refresh_token;
      const clientIdSecret = btoa(`${cId}:${cSecret}`);
      const response = await axios({
        method: "POST",
        url: `${cApsUrl}/authentication/v2/token`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + clientIdSecret
        },
        data: `grant_type=refresh_token&refresh_token=${rToken}`
      });

      req.session = req.session || {};
      req.session.access_token = response.data.access_token;
      req.session.refresh_token = response.data.refresh_token;

      res.end(response.data.access_token);
      return;
    } catch (err) {
      // If refresh failed
      delete req.session.access_token;
      delete req.session.refresh_token;
      
      res.status(400).end();
      return;
    }
  }

  let access_token = req.session?.access_token;

  if (!access_token) {
    res.status(401).end();
    return;
  }

  res.end(access_token);
});

app.get("/oauth/url", (req, res) => {
  console.log("/oauth/url", req.session);

  let cId = req.session.client_id ? req.session.client_id : clientId;
  let cApsUrl = req.session.apsUrl ? req.session.apsUrl : apsUrl;

  const url =
    cApsUrl +
    "/authentication/v2/authorize?response_type=code" +
    "&client_id=" +
    cId +
    "&redirect_uri=" +
    callbackUrl +
    "&scope=data:read data:write data:create data:search";

  res.end(url);
});

app.get("/", (req, res) => {
  let cDataEndpoint = req.session.dataEndpoint ? req.session.dataEndpoint : dataEndpoint;
  const fileName = cDataEndpoint.endsWith("/private/graphql") ? "index.html"  : "index-mono.html"
  fs.readFile(path.dirname(fileURLToPath(import.meta.url)) + '/public/' + fileName, 'utf8', (err, text) => {
    text = text.replace("%APS_DATA_ENDPOINT%", cDataEndpoint);
    res.send(text);
  });
});

app.get("/voyager", (req, res) => {
  let cDataEndpoint = req.session.dataEndpoint ? req.session.dataEndpoint : dataEndpoint;
  fs.readFile(path.dirname(fileURLToPath(import.meta.url)) + '/public/voyager.html', 'utf8', (err, text) => {
    text = text.replace("%APS_DATA_ENDPOINT%", cDataEndpoint);
    res.send(text);
  });
});

app.get("/credentials", (req, res) => {
  fs.readFile(path.dirname(fileURLToPath(import.meta.url)) + '/public/credentials.html', 'utf8', (err, text) => {
    text = text.replace(/\%CALLBACK_URL\%/g, callbackUrl);
    res.send(text);
  });
});

app.post("/credentials", urlencodedParser, (req, res) => {
  req.session.client_id = req.body.clientId;
  req.session.client_secret = req.body.clientSecret;
  req.session.dataEndpoint = req.body.gqlUrl || dataEndpoint;
  req.session.apsUrl = req.body.baseUrl || apsUrl;

  delete req.session.access_token;
  delete req.session.refresh_token;

  if (req.body.clientId === "") {
    delete req.session.client_id; 
    delete req.session.client_secret;
    delete req.session.dataEndpoint;
    delete req.session.apsUrl;
  }

  res.redirect("/");
});

app.get("/userprofile", async (req, res) => {
  try {
    let env = "";
    if (req.session.apsUrl) {
      if (req.session.apsUrl.includes("stg")) {
        env = "-stg";
      } else if (req.session.apsUrl.includes("dev")) {
        env = "-dev";
      }
    }

    const response = await axios({
      method: "POST",
      url: `https://api.userprofile${env}.autodesk.com/userinfo`,
      headers: {
        "Authorization": "Bearer " + req.session.access_token
      }
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).end();
  }
});

app.get("/logout", async (req, res) => {
  let cApsUrl = req.session.apsUrl ? req.session.apsUrl : apsUrl;

  req.session = null;

  res.end(`${cApsUrl}/authentication/v2/logout`);
});


app.use(
  express.static(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "public")
  )
);

app.listen(serverPort);

console.log(
  `Open ${serverUrl} in a web browser in order to log in with your Autodesk account!`
);
