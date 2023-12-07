const soap = require("soap");
const url =
  "https://comercios.directo.com.ar/ServiciosWeb/ComercioWebService.asmx?WSDL";
const wsdlOptions = { useEmptyTag: true, preserveWhitespace: true };
const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
dotenv.config();
const app = express();
app.use(cors());
//app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
const username = process.env.USER_CREDICUOTAS;
const password = process.env.PASS_CREDICUOTAS;
const host = process.env.HOST_CREDICUOTAS;
const verificationId = process.env.VERIFICATION_ID_CREDICUOTAS;
const verificationCode = process.env.VERIFICATION_CODE_CREDICUOTAS;
const auth =
  "Basic " + Buffer.from(username + ":" + password).toString("base64");

const uri = process.env.URL_MONGO;
const subdomain = process.env.SUBDOMAIN_KOMMO;
const portApp = process.env.PORT_APP || 3000;
const jsonResponse = {
  data: {
    user_id: "6509141",
    domain: "grupogf2",
    users_count: "3",
    admins: [
      {
        id: "6509141",
        name: "Fernando",
        email: "fernando@grupogf2.com.ar",
        active: "true",
        is_admin: "Y",
        phone: "+5491164776347",
      },
    ],
    account_id: "29139821",
    tariffName: "pro",
    paid_till: "true",
    current_user: {
      id: "6509141",
      name: "Fernando",
      phone: "+5491164776347",
      email: "fernando@grupogf2.com.ar",
    },
  },
  success: true,
  tariff: {
    is_active: true,
    expire_at: "11.08.2024",
    expire_at_human: "August 11, 2030",
    type: "pro",
    is_paid: true,
  },
  notifications: [],
};
//creo array para guardar requests
var requests = [];

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let variables = {
  access_token: "",
  refreshTkn: "",
};

async function getCodes() {
  console.log("getCodes");
  await client.connect();
  const collection = client.db("kommo_aszi").collection("variables");
  const result = await collection.find().sort({ _id: -1 }).limit(1).toArray();
  variables.access_token = result[0].access_token;
  variables.refreshTkn = result[0].refresh_token;
  console.log("codes obtained");
}

async function postRequest() {
  const url = `https://${subdomain}/oauth2/access_token`;
  const data = {
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: variables.refreshTkn,
    redirect_uri: "https://webhook.site/2cec3208-936f-4464-8940-8116b7f3d6ff",
  };
  const headers = { "Content-Type": "application/json" };
  try {
    const response = await axios.post(url, data, { headers });
    const parsedData = response.data;
    if ("refresh_token" in parsedData) {
      await uploadCodes(parsedData.access_token, parsedData.refresh_token);
      return variables.refreshTkn;
    } else {
      throw new Error("No refresh token in response");
    }
  } catch (error) {
    throw error;
  }
}

async function uploadCodes(access_token, refresh_token) {
  console.log("uploadCodes");
  await client.connect();
  const collection = client.db("kommo_aszi").collection("variables");
  await collection.insertOne({
    access_token,
    refresh_token,
    created_at: new Date(),
  });
  console.log("codes uploaded");
}

//EVALUACION CREDICUOTAS
async function getCreditCredicuotas(dni, telefono, urlContinue) {
  try {
    const responseCredit = await getMaxAvailable(dni, telefono);
    const importeCredito = responseCredit.importe;
    const mensajeCredito = responseCredit.error;
    const data = responseBuilder(importeCredito, mensajeCredito);
    await continueBotDirecto(urlContinue, data);
  } catch (err) {
    console.log("ERROR EN EL BLOQUE GET CREDIT: ", err.message);
  }
}
//funcion para armar el json de respuesta
function responseBuilder(importeCredito, mensajeCredito) {
  if (importeCredito == 0) {
    if (
      mensajeCredito ===
        "Este número de celular está asociado a un cliente existente de Credicuotas." ||
      mensajeCredito ===
        "El codigo de area del telefono no corresponde con un codigo de area valido." ||
      mensajeCredito ===
        "El telefono ingresado no tiene una cantidad de digitos valida." ||
      mensajeCredito ===
        "El codigo de area del telefono no corresponde con un codigo de area valido. " ||
      mensajeCredito ===
        "El telefono ingresado no tiene una cantidad de digitos valida. "
    ) {
      const data = {
        data: {
          status: "fail",
          importe: importeCredito,
          motivo: mensajeCredito,
          statusId: 59063680,
        },
      };
      return data;
    } else {
      const data = {
        data: {
          status: "fail",
          importe: importeCredito,
          motivo: mensajeCredito,
          statusId: 58872716,
        },
      };
      return data;
    }
  } else {
    const data = {
      data: {
        status: "success",
        importe: importeCredito,
        statusId: 58825496,
      },
    };
    return data;
  }
}
//FIN EVALUACION CREDICUOTAS

///CODIGO PARA EL BOT DE DIRECTO
//funcion para obtener ofertas
async function getOfertas(
  fullName,
  dni,
  sexo,
  telefono,
  montoCredicuotas,
  urlContinue
) {
  const args = {
    ComercioObtenerOfertasRequest: {
      usuario: "ASZIWEB",
      clave: "aszi123456",
      idTipoDocumento: 1,
      documento: dni,
      idSexo: sexo == "M" ? 2 : 3,
      apellidoYNombre: fullName,
      telefonoCelularCodigoArea: telefono.slice(3, -8),
      telefonoCelularNumero: telefono.slice(-8),
      idPoliticaComercial: 2,
    },
  };
  soap.createClient(url, wsdlOptions, function (err, client) {
    if (err) console.error(err);
    else {
      client.ComercioObtenerOfertas(args, function (err, response) {
        if (err) console.error(err);
        else {
          // Aquí puedes manipular la respuesta
          console.log(response);
          let responseString = JSON.stringify(response);
          if (
            response.ComercioObtenerOfertasResult.resultado.estado == "EXITO"
          ) {
            console.log("OFERTA OBTENIDA");
            console.log(
              response.ComercioObtenerOfertasResult.comercioOferta
                .ComercioOferta[0].montoMaximo
            );
            const data = {
              data: {
                status: "success",
                montoMaximo:
                  response.ComercioObtenerOfertasResult.comercioOferta
                    .ComercioOferta[0].montoMaximo,
              },
            };
            continueBotDirecto(urlContinue, data);
          } else {
            console.log("Fracaso");
            const data = {
              data: {
                status: "fail",
                mensaje:
                  response.ComercioObtenerOfertasResult.resultado.mensaje,
              },
            };
            continueBotDirecto(urlContinue, data);
          }
          //let cleanedResponse = responseString.replace("\ufeff", "");
        }
      });
    }
  });
}
//funcion para obtner nombres de DNI
async function getNombresDNI(dni, sexo, urlContinue) {
  const args = {
    ComercioObtenerNombresRequest: {
      usuario: "ASZIWEB",
      clave: "aszi123456",
      idTipoDocumento: 1,
      documento: dni,
      idSexo: sexo == "Masculino" ? 2 : 3,
    },
  };
  soap.createClient(url, wsdlOptions, function (err, client) {
    if (err) console.error(err);
    else {
      client.ComercioObtenerNombres(args, function (err, response) {
        if (err) console.error(err);
        else {
          // Aquí puedes manipular la respuesta
          //console.log(response);
          let responseString = JSON.stringify(response);
          //console.log(response.ComercioObtenerNombresResult)
          if (
            response.ComercioObtenerNombresResult.resultado.estado == "EXITO"
          ) {
            console.log("Nombres obtenidos");
            console.log(
              response.ComercioObtenerNombresResult.nombres.string[0]
            );
            const data = {
              data: {
                status: "success",
                name: response.ComercioObtenerNombresResult.nombres.string[0],
              },
            };
            continueBotDirecto(urlContinue, data);
          } else {
            console.log("Fracaso");
            const data = {
              data: {
                status: "fail",
                name: "No se encontraron nombres",
              },
            };
            continueBotDirecto(urlContinue, data);
          }
          //let cleanedResponse = responseString.replace("\ufeff", "");
          //console.log(cleanedResponse);
        }
      });
    }
  });
}
//funcion que parsea los datos del body
async function processRequestSBdirecto(body) {
  const settingsStr = body.data.settings.replace(/\\"/g, '"').slice(1, -1);
  const bodyParsed = JSON.parse(settingsStr);
  const bodyFields = bodyParsed.body_fields;
  const urlContinue = body.return_url.replace(".ru", ".com");
  const webhookName = bodyParsed.webhook_name;
  //console.log(bodyFields);

  //uso reduce para armar el json de respuesta
  const result = bodyFields.reduce((acc, field) => {
    acc[field.left_val] = field.right_val;
    return acc;
  }, {});
  for (const key in result) {
    // Reemplaza \\n con una cadena vacía en el valor de la propiedad
    result[key] = result[key].replace(/\\n/g, "");
  }
  console.log(result);
  console.log(webhookName);

  //llamo funcion en base al webhook_name
  if (webhookName == "credicuotas") {
    await getCreditCredicuotas(result.dni, result.tel, urlContinue);
  } else if (webhookName == "getOfertas") {
    await getOfertas(
      result.fullName,
      result.dni,
      result.sexo,
      result.telefono,
      result.montoCredicuotas,
      urlContinue
    );
  } else if (webhookName == "getNombresDNI") {
    await getNombresDNI(result.dni, result.sexo, urlContinue);
  } else if (webhookName == "getMacro") {
    await getCreditMacro(
      result.dni,
      result.fullName,
      result.sexo,
      result.montoCredicuotas,
      result.montoDirecto,
      urlContinue
    );
  }
}
//funcion para continuar el bot, enviando los datos obtenidos en el api.
async function continueBotDirecto(urlContinue, data) {
  //obtener token
  await getCodes();
  const token = variables.access_token;
  const url = urlContinue;
  console.log(data);

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.post(url, data, config);
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}
//FIN CODIGO DIRECTO

//INICIO CREDITO CREDICUOTAS
async function getMaxAvailable(dni, telefono) {
  const url = `${host}/${dni}/max?&verificationId=${verificationId}&verificationCode=${verificationCode}&customerCellPhone=${telefono}`;
  //console.log(url);
  const options = {
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
  };
  try {
    const response = await axios.get(url, options);
    const dataResponse = response.data;
    const { maxAmount, rejectedReason, codRejectedReason } = dataResponse;
    var responseScore = {};
    //chequear si el prospecto esta aprobado
    if (maxAmount != null) {
      console.log(`Aprueba por ${maxAmount}`);
      responseScore.importe = maxAmount;
      responseScore.error = null;
      console.log(responseScore);
      return responseScore;
    } else {
      console.log(`No aprueba por ${rejectedReason} - ${codRejectedReason}`);
      responseScore.importe = 0.0;
      responseScore.error =
        codRejectedReason == "CELL_NUMBER_NOT_AVAILABLE"
          ? "Este número de celular está asociado a un cliente existente de Credicuotas."
          : codRejectedReason;
      console.log(responseScore);
      return responseScore;
    }
    //console.log(response.data);
  } catch (error) {
    console.log("Es un error");
    console.log(error.response.data);
    //imprimir codigo de error
    const errorCode = error.response.data.errorCode;
    const errorCause = error.response.data.cause;
    console.log(errorCode);
    var responseScore = {};
    if (errorCode == "CELL_NUMBER_NOT_AVAILABLE") {
      responseScore.importe = 0.0;
      responseScore.error =
        "Este número de celular está asociado a un cliente existente de Credicuotas.";
      console.log(responseScore);
      return responseScore;
    } else {
      responseScore.importe = 0.0;
      responseScore.error = errorCause;
      console.log(responseScore);
      return responseScore;
    }
  }
}
//FIN INICIO CREDICUOTAS
//INICIO DE CONTROL MACRO

async function getCreditMacro(
  dni,
  fullName,
  gender,
  montoCredicuotas,
  montoDirecto,
  urlContinue
) {
  const names = fullName.split(",")[1].toUpperCase();
  console.log(names);
  const lastName = fullName.split(",")[0].toUpperCase();
  console.log(lastName);
  const tokenMacro = process.env.TOKEN_MACRO;
  const urlMacro = process.env.URL_MACRO;
  const data = {
    customerId: dni,
    customerGender: gender,
    customerFirstName: names,
    customerLastName: lastName,
  };
  const config = {
    headers: {
      Accept: "application/json",
      "X-Tenant": "macro",
      Authorization: `Bearer ${tokenMacro}`,
      "Content-Type": "application/json",
    },
  };
  try {
    const response = await axios.post(urlMacro, data, config);
    console.log(response.data);
    await responseBuilderMacro(
      response.data,
      montoCredicuotas,
      montoDirecto,
      urlContinue
    );
  } catch (error) {
    console.log("Es un error de macro");
    console.log(error.response.data);
    await responseBuilderMacroError(
      error.response.data,
      montoCredicuotas,
      montoDirecto,
      urlContinue
    );
  }
}
//funcionr para armar el json de respuesta
async function responseBuilderMacro(
  data,
  montoCredicuotas,
  montoDirecto,
  urlContinue
) {
  let ofertas = {
    Credicuotas: parseInt(montoCredicuotas),
    Directo: parseInt(montoDirecto),
  };
  console.log(ofertas)
  if (data.status == "APPROVED") {
    ofertas.Macro = parseInt(data.offerMaximumAmount);
    const maxOferta = await getMaxOferta(ofertas);
    const dataBot = {
      data: {
        status: "success",
        importe: maxOferta.importe,
        banco: maxOferta.banco,
        macro: data.offerMaximumAmount,
      },
    };
    continueBotDirecto(urlContinue, dataBot);
  } 
  else 
  {
    const maxOferta = await getMaxOferta(ofertas);
    if(maxOferta.importe > 0){
      const dataBot = {
        data: {
          status: "success",
          importe: maxOferta.importe,
          banco: maxOferta.banco,
          macro: 0,
          responseMacro: 200,
        },
      };
      continueBotDirecto(urlContinue, dataBot);
    }
    else{
      const dataBot = {
        data: {
          status: "fail",
          macro: 0,
          responseMacro: 200,
        },
      };
      continueBotDirecto(urlContinue, dataBot);
    }
    
  }
}
async function responseBuilderMacroError(
  data,
  montoCredicuotas,
  montoDirecto,
  urlContinue
) {
  let ofertas = {
    Credicuotas: montoCredicuotas,
    Directo: montoDirecto,
  };
  const maxOferta = await getMaxOferta(ofertas);
  if(maxOferta.importe > 0){
    const dataBot = {
      data: {
        status: "success",
        importe: maxOferta.importe,
        banco: maxOferta.banco,
        macro: 0,
        responseMacro: 200,
      },
    };
    continueBotDirecto(urlContinue, dataBot);
  }
  else{
    const dataBot = {
      data: {
        status: "fail",
        macro: 0,
        responseMacro: 200,
        errorMacro: data.errorCode,
      },
    };
    continueBotDirecto(urlContinue, dataBot);
  }
}
//funcion para obtener el valor mas alto de las ofertas, se recibe un objeto con los valores, se debe devolver el valor mas alto y el nombre del bancoy el nombre del banco
async function getMaxOferta(ofertas) {
  // Filtrar valores undefined y convertirlos a 0
  const ofertasFiltradas = Object.fromEntries(
    Object.entries(ofertas).map(([key, value]) => [key, value || 0])
  );

  // Calcular el máximo de las ofertas filtradas
  const max = Math.max(
    ...Object.values(ofertasFiltradas).map(value => parseFloat(value))
  );

  // Encontrar el nombre del banco asociado al máximo
  const banco = Object.keys(ofertasFiltradas).find(
    (key) => parseFloat(ofertasFiltradas[key]) === max
  );

  console.log("banco: " + banco + " importe: " + max);
  return { banco: banco, importe: max };
}
//FIN DE CONTROL MACRO

//rutas para el widget
app.post(
  "/api/widget/efece_send_webhook/salesbot_request",
  async (req, res) => {
    res.sendStatus(200);
    //console.log(req.body);
    await processRequestSBdirecto(req.body);
    requests.push({
      path: "/api/widget/efece_send_webhook/salesbot_request",
      body: req.body,
    });
  }
);
// creo ruta para /api/account
app.post("/api/account", (req, res) => {
  res.json(jsonResponse);
  requests.push({ path: "/api/account", body: req.body });
});
//creo ruta para /api/onsave
app.post("/api/onsave", (req, res) => {
  res.json(jsonResponse);
  requests.push({ path: "/api/onsave", body: req.body });
});
//creo ruta para /api/onsave/efece_send_webhook
app.post("/api/onsave/efece_send_webhook", (req, res) => {
  res.json(jsonResponse);
  requests.push({ path: "/api/onsave/efece_send_webhook", body: req.body });
});
//creo ruta para /api/account/efece_send_webhook
app.post("/api/account/efece_send_webhook", (req, res) => {
  res.json(jsonResponse);
  requests.push({ path: "/api/account/efece_send_webhook", body: req.body });
});
app.get("/token", async (req, res) => {
  try {
    await getCodes();
    await postRequest();
    res.json({ exitoso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(portApp, () => console.log(`App listening on port ${portApp}`));
