import logging
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import model
from vectorizer import convert_user_to_vector

# Set up basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Model Training System API")

class TrainRequest(BaseModel):
    users: List[Dict[str, Any]]

class MatchRequest(BaseModel):
    userProfile: Dict[str, Any]
    currentUserId: str = None

@app.post("/train")
def train_endpoint(request: TrainRequest):
    logger.info(f"Received request to train model with {len(request.users)} users.")
    
    if not request.users:
        logger.warning("No users provided in the request.")
        raise HTTPException(status_code=400, detail="No users provided for training.")
        
    try:
        success = model.trainModel(request.users)
        if success:
            logger.info("Model trained successfully.")
            return {"message": "Model trained successfully."}
        else:
            logger.error("Failed to train model. Valid vectors might be missing.")
            raise HTTPException(status_code=400, detail="Failed to train model. Ensure user profiles are valid.")
    except Exception as e:
        logger.error(f"Error during training: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/match")
def match_endpoint(request: MatchRequest):
    logger.info("Received request to find matches.")
    
    if not request.userProfile:
        logger.warning("No user profile provided in the request.")
        raise HTTPException(status_code=400, detail="No user profile provided.")
        
    try:
        # Convert to vector
        user_vector = convert_user_to_vector(request.userProfile)
        
        # We need to handle the case where the model hasn't been trained yet
        matches = model.findMatches(user_vector, current_user_id=request.currentUserId)
        logger.info(f"Successfully found {len(matches)} matches.")
        return matches
        
    except ValueError as ve:
        logger.warning(f"Validation error during matching: {str(ve)}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error during matching: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Optional: run directly for testing
    uvicorn.run(app, host="0.0.0.0", port=8000)
