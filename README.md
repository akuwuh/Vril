# HW12

Bare minimum boilerplate replicating the structure of HTV.

## Frontend

Next.js app with Tailwind CSS.

```bash
cd frontend
npm install
npm run dev
```

## Backend

FastAPI app with Docker Compose.

```bash
cd backend
# Local
pip install -r requirements.txt
uvicorn main:app --reload

# Docker
docker-compose up --build
```

