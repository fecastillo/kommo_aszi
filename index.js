const express = require('express');
const dotenv = require('dotenv');
const { urlencoded } = require("body-parser");
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();
const app = express();
//app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

const uri = process.env.URL_MONGO;
const subdomain = process.env.SUBDOMAIN_KOMMO;
const domain_fin = process.env.URL_FIN;
const usr_fin = process.env.USR_FIN;
const portApp = process.env.PORT_APP || 3000;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let variables = {
    access_token: '',
    refreshTkn: '',
};

async function getCodes() {
  console.log('getCodes');
  await client.connect();
  const collection = client.db('kommo_aszi').collection('variables');
  const result = await collection.find().sort({ _id: -1 }).limit(1).toArray();
  variables.access_token = result[0].access_token;
  variables.refreshTkn = result[0].refresh_token;
  console.log('codes obtained');
}

async function postRequest() {
  const url = `https://${subdomain}/oauth2/access_token`;
  const data = {
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: variables.refreshTkn,
    redirect_uri:
      'https://webhook.site/2cec3208-936f-4464-8940-8116b7f3d6ff',
  };
  const headers = { 'Content-Type': 'application/json' };
  try {
    const response = await axios.post(url, data, { headers });
    const parsedData = response.data;
    if ('refresh_token' in parsedData) {
      await uploadCodes(parsedData.access_token, parsedData.refresh_token);
      return variables.refreshTkn;
    } else {
      throw new Error('No refresh token in response');
    }
  } catch (error) {
    throw error;
  }
}  

async function uploadCodes(access_token, refresh_token) {
  console.log('uploadCodes');
  await client.connect();
  const collection = client.db('kommo_aszi').collection('variables');
  await collection.insertOne({
    access_token,
    refresh_token,
    created_at: new Date(),
  });
  console.log('codes uploaded');
}

async function getLead(leadId) {
  try {
    console.log('getLead');
    await getCodes();
    const url = `https://${subdomain}/api/v4/leads/${leadId}?with=contacts`;
    const headers = {
      Authorization: `Bearer ${variables.access_token}`,
    };
    const response = await axios.get(url, { headers });
    const data = response.data;
    const urlContact = data._embedded.contacts[0]._links.self.href;
    console.log(data)
    await getContact(urlContact, leadId);
    console.log('lead processed')
  } catch (err) {
    console.log(err);
  }
}

async function getContact(urlContact, leadId) {
  try {
    console.log('getContact');
    const url = urlContact;
    const headers = {
      Authorization: `Bearer ${variables.access_token}`,
    };
    const response = await axios.get(url, { headers });
    const data = response.data;
    console.log(data);
    // extract phone number and dni from response
    const dniFind = data.custom_fields_values.find(
      (element) => element.field_id === 1866455
    );
    const telefonoFind = data.custom_fields_values.find(
      (element) => element.field_id === 1866519
    );
    const dni = dniFind.values[0].value;
    const telefono = telefonoFind.values[0].value;

    // CONSULT CREDIT STATUS
    const responseCredit = await getCredit(dni, telefono);
    console.log(responseCredit);
    const importeCredito = responseCredit[0].importe;
    const mensajeCredito = responseCredit[0].mensaje;

    // UPDATE CONTACT
    let contactData;
    if (importeCredito === '0.00') {
        contactData = {
          updated_by: 0,
          status_id: 58825500,
          custom_fields_values: [
            {
              field_id: 1866451,
              field_name: 'Credito',
              values: [
                {
                  value: importeCredito,
                },
              ],
            },
            {
              field_id: 1866453,
              field_name: 'Califica',
              values: [
                {
                  value: false,
                },
              ],
            },
          ],
        };
    } else {
      contactData = {
        updated_by: 0,
        status_id: 58825496,
        custom_fields_values: [
          {
            field_id: 1866451,
            field_name: 'Credito',
            values: [
              {
                value: importeCredito,
              },
            ],
          },
          {
            field_id: 1866453,
            field_name: 'Califica',
            values: [
              {
                value: true,
              },
            ],
          },
        ],
      };
    }
    await updateContact(contactData, leadId);
    console.log('contact updated');
  } catch (err) {
    console.log(err);
  }
}

function getCredit(dni, telefono) {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `http://${domain_fin}?dni=${dni}&phone=${telefono}&CredencialesUsuarioId=${usr_fin}`;
      const response = await axios.get(url);
      resolve(response.data);
    } catch (err) {
      reject(err);
    }
  });
}

async function updateContact(data, leadId) {
  try {
    const url = `https://${subdomain}/api/v4/leads/${leadId}`;
    const headers = {
      Authorization: `Bearer ${variables.access_token}`,
    };
    await axios.patch(url, data, { headers });
  } catch (err) {
    console.log(err);
  }
}

async function changeState(leadId) {
  
  try {
    console.log(leadId);
    await getCodes();
    const updateData = {
      updated_by: 0,
      status_id: 58803424,
    };
    const url = `https://${subdomain}/api/v4/leads/${leadId}`;
    const headers = {
      Authorization: `Bearer ${variables.access_token}`,
    };
    response = await axios.patch(url, updateData, { headers });
    console.log(response.data);
  } catch (err) {
    console.log(err);
  }
}

async function process_data(data) {
  try {
    await getLead(data.leads.add[0].id);
  } catch (err) {
    console.log(err);
  }
}


app.get('/token', async (req, res) => {
  try {
    await getCodes();
    await postRequest();
    res.json({ exitoso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/handler', async (req, res) => {
  console.log('body: ',req.body.leads.add[0].id);
  await getLead(req.body.leads.add[0].id);
  res.sendStatus(200);
});

app.post('/changeState', async (req, res) => {
  console.log('body ',req.body.leads.status[0].id);
  await changeState(req.body.leads.status[0].id);
  res.sendStatus(200);
});

app.listen(portApp, () => console.log(`App listening on port ${portApp}`));

