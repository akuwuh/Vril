from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.endpoints.trellis.router import router as trellis_router
from app.endpoints.product.router import router as product_router
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI(title="Trellis 3D Generation API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(trellis_router)
app.include_router(product_router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Trellis 3D Generation API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
