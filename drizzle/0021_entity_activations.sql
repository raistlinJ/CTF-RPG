CREATE TABLE IF NOT EXISTS entity_activations(user TEXT NOT NULL REFERENCES students(id),entity TEXT NOT NULL,PRIMARY KEY(user,entity));
