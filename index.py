import pymongo
from pymongo import MongoClient
from datetime import datetime
import requests
import os
import json
import dotenv
from flask import Flask, request, make_response
from threading import Thread

dotenv.load_dotenv()
app = Flask(__name__)

uri = os.environ["URL_MONGO"]
subdomain = os.environ["SUBDOMAIN_KOMMO"]
domain_fin = os.environ["URL_FIN"]
usr_fin = os.environ["USR_FIN"]
portApp = os.environ.get("PORT_APP", 3000)

client = MongoClient(uri)

class TokenManager:
    def __init__(self):
        self.variables = {
            "access_token": "",
            "refreshTkn": "",
        }

    def getCodes(self):
        db = client["kommo_aszi"]
        collection = db["variables"]
        
        result = list(collection.find().sort("_id", -1).limit(1))
        
        self.variables["access_token"] = result[0]["access_token"]
        self.variables["refreshTkn"] = result[0]["refresh_token"]

    def postRequest(self):
        url = f"https://{subdomain}/oauth2/access_token"
        data = {
            "client_id": os.environ["CLIENT_ID"],
            "client_secret": os.environ["CLIENT_SECRET"],
            "grant_type": "refresh_token",
            "refresh_token": self.variables["refreshTkn"],
            "redirect_uri": "https://webhook.site/2cec3208-936f-4464-8940-8116b7f3d6ff",
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, data=json.dumps(data), headers=headers)
        parsedData = response.json()
        
        
        if "refresh_token" in parsedData:
            self.uploadCodes(parsedData["access_token"], parsedData["refresh_token"])
            return self.variables["refreshTkn"]
        else:
            raise Exception("No refresh token in response")

    def uploadCodes(self, access_token, refresh_token):
        db = client["kommo_aszi"]
        collection = db["variables"]
        
        collection.insert_one({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "created_at": datetime.now(),
        })

#Inicio de clase para manejar el webhook


def getLead(leadId):
    try:
        token_manager.getCodes()
        url = f"https://{subdomain}/api/v4/leads/{leadId}?with=contacts"
        headers = {"Authorization": f"Bearer {token_manager.variables['access_token']}"}
        response = requests.get(url, headers=headers)
        data = response.json()
        urlContact = data["_embedded"]["contacts"][0]["_links"]["self"]["href"]
        idContact = data["_embedded"]["contacts"][0]["id"]
        getContact(urlContact, leadId)
    except Exception as err:
        print(err)

def getContact(urlContact, leadId):
    try:
        url = urlContact
        headers = {"Authorization": f"Bearer {token_manager.variables['access_token']}"}
        response = requests.get(url, headers=headers)
        data = response.json()
        #extraer numero de telefono y dni de la respuesta
        dniFind = next((element for element in data["custom_fields_values"] if element["field_id"] == 1866455), None)
        telefonoFind = next((element for element in data["custom_fields_values"] if element["field_id"] == 180592), None)
        dni = dniFind["values"][0]["value"]
        telefono = telefonoFind["values"][0]["value"]
        #CONSULTO EL ESTADO CREDITICIO
        response = getCredit(dni, telefono)
        importeCredito = response[0]["importe"]
        errorCredito = response[0]["error"]
        #ACTUALIZO EL CONTACTO
        if importeCredito == '0.00':
            data = {
                'updated_by': 0,
                'status_id' : 58825500,
                'custom_fields_values': [
                    {
                    'field_id': 1866451,
                    'field_name' : 'Credito',
                    'values': [
                        {
                        'value': importeCredito
                        }
                    ]
                    },
                    {
                    'field_id': 1866453,
                    'field_name' : 'Califica',
                    'values': [
                        {
                        'value': False
                        }
                    ]
                    }
                ]
            }
        else:
            data = {
                'updated_by': 0,
                'status_id' : 58825496,
                'custom_fields_values': [
                    {
                    'field_id': 1866451,
                    'field_name' : 'Credito',
                    'values': [
                        {
                        'value': importeCredito
                        }
                    ]
                    },
                    {
                    'field_id': 1866453,
                    'field_name' : 'Califica',
                    'values': [
                        {
                        'value': True
                        }
                    ]
                    }
                ]
            }
            
        updateContact(data, leadId)
    except Exception as err:
        print(err)

def getCredit(dni, telefono):
    try:
        url = f"http://{domain_fin}?dni={dni}&phone={telefono}&CredencialesUsuarioId={usr_fin}"
        response = requests.get(url)
        return response.json()
    except Exception as err:
        print(err)

def updateContact(data, leadId):
    try:
        url = f"https://{subdomain}/api/v4/leads/{leadId}"
        headers = {"Authorization": f"Bearer {token_manager.variables['access_token']}"}
        requests.patch(url, data=json.dumps(data), headers=headers)
    except Exception as err:
        print(err)
        
def changeState(leadId):
    #proceso data del webhook y Cambio el lead a reevaluar
    print(leadId)
    try:
        token_manager.getCodes()
        data = {
                'updated_by': 0,
                'status_id' : 58803424
            }
        url = f"https://{subdomain}/api/v4/leads/{leadId}"
        headers = {"Authorization": f"Bearer {token_manager.variables['access_token']}"}
        response = requests.patch(url, data=json.dumps(data), headers=headers)
    except Exception as err:
        print(err)
        
def process_data(data):
    try:
        getLead(data["leads"]["add"][0]["id"])
    except Exception as err:
        print(err)
        
def process_data_change(data):
    try:
        changeState(data["leads"]["add"][0]["id"])
    except Exception as err:
        print(err)
token_manager = TokenManager()

@app.route("/token", methods=["GET"])
def token_route():
    try:
        token_manager.getCodes()
        token_manager.postRequest()
        return {"exitoso": True}
    except Exception as err:
        return {"error": str(err)}, 500

@app.route("/handler", methods=["POST"])
def webhook_route():
    data = request.json
    response = make_response("", 200)
    thread = Thread(target=process_data, args=(data,))
    thread.start()
    return response

@app.route("/changeState", methods=["POST"])
def changeState_route():
    data = request.json
    response = make_response("", 200)
    thread = Thread(target=process_data_change, args=(data,))
    thread.start()
    return response


if __name__ == "__main__":
    app.run(port=portApp)

