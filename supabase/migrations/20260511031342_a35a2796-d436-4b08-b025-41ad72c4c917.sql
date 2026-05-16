CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users
SET encrypted_password = extensions.crypt('Carolina1028', extensions.gen_salt('bf')),
    updated_at = now()
WHERE email = 'aperezavilez@gmail.com';