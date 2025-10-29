import pytest
import random
import requests
from requests.utils import unquote
import quopri
import re

# crear token
MAILHOG_API = "http://localhost:8025/api/v2/messages"

def get_last_email_body():
    resp = requests.get(MAILHOG_API)
    resp.raise_for_status()
    data = resp.json()

    if not data["items"]:
        return None  # no emails received yet

    last_email = data["items"][0]
    body = last_email["Content"]["Body"]
    decoded = quopri.decodestring(body).decode("utf-8", errors="replace")
    return unquote(decoded)

def extract_links(decoded_html):
    return re.findall(r'<a\s+href=["\']([^"\']+)["\']', decoded_html, re.IGNORECASE)[0]

def extract_query_params(url):
    # regex: busca ?token= o &token= seguido de cualquier cosa hasta &, # o fin de string
    patron = re.compile(r"(?:[?&])token=([^&#]+)")
    m = patron.search(url)
    return m.group(1) if m else None

@pytest.fixture(autouse=True)
def setup_create_user():
    # random username
    i= random.randint(1000, 999999)
    username = f'user{i}'
    email = f'{username}@test.com'
    password = 'password'
    salida = requests.post("http://localhost:5000/users",
                        data={
                            "username": username, 
                            "password": password,
                            "email":email,
                            "first_name":"Name",
                            "last_name": f'{username}son'
                            })
    # user created
    assert salida.status_code == 201

    mail = get_last_email_body()
    link = extract_links(mail)
    token = extract_query_params(link)

    # activate user
    response = requests.post("http://localhost:5000/auth/set-password", json={"token": token, "newPassword": password})


    return [username,password]

def test_login(setup_create_user):
    username = setup_create_user[0]
    password = setup_create_user[1]

    response = requests.post("http://localhost:5000/auth/login", json={"username": username, "password": password})
    auth_token = response.json()["token"]
    assert auth_token

"""
Este test esta disenado para fallar en la rama main ya que la vulnerabilidad esta prensente y pasar en la rama 
practico-2 en la cual anteriormente mitigamos la vulnerabilidad. El proposito de este test es actuar como prueba 
de regresión para evitar que la sqli vuelva a introducirse en futuras versiones del programa.
"""
def test_sqli(setup_create_user):
    # Autenticacion
    # Usamos el usuario creado por el fixture para autenticarnos y obtener el token
    # Esto es necesario porque el endpoint /Invoices requiere autorizacion
    username = setup_create_user[0]
    password = setup_create_user[1]

    response = requests.post("http://localhost:5000/auth/login", json={"username": username, "password": password})
    auth_token = response.json()["token"]

    # Verificamos que el login haya sido exitoso y que se haya recibido un token
    assert auth_token

    # Consulta maliciosa
    # Enviamos una consulta sqli al endpoint /Invoices
    # Esta consulta intenta forzar una division por cero en el motor de base de datos
    # Si la vulnerabilidad no esta mitigada el servidor deberia lanzar una excepcion
    # Si esta mitigada el servidor deberia responder con un array vacio
    sqli_payload = "' OR (1/0)::int IS NOT NULL--"
    sqli_response = requests.get(
        f"http://localhost:5000/Invoices?status={sqli_payload}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    # Validacion
    # Verificamos que la respuesta sea segura
    # En este caso esperamos un array vacio como senal de que la inyeccion fue bloqueada
    data = sqli_response.json()
    assert not data  # Si hay datos la inyeccion no fue mitigada correctamente
