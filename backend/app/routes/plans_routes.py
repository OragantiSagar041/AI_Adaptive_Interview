from fastapi import APIRouter
from app.db.database import plans_collection
import json
import os
from app.core.config import PLAN_DEFINITIONS

router = APIRouter()

@router.get("/api/plans")
def get_plans():
    plans_list = []
    
    # Load active features registry
    registry_path = os.path.join(os.path.dirname(__file__), '..', '..', 'features_registry.json')
    active_features = set()
    try:
        with open(registry_path, 'r') as f:
            active_features = set(json.load(f))
    except Exception:
        pass

    try:
        plans_cursor = plans_collection.find({})
        for p in plans_cursor:
            if p.get("plan_name", "").lower() == "owner":
                continue
            plans_list.append({
                "id": str(p["_id"]),
                "plan_name": p.get("plan_name", "Unknown Plan"),
                "credits": p.get("credits_granted", 0),
                "price": p.get("price", 0),
                "features": [f for f in p.get("features", []) if f in active_features] if active_features else p.get("features", []),
                "summary": p.get("summary", "")
            })
    except Exception as e:
        print(f"[API Plans] MongoDB error: {e}. Falling back to default plans.")
    
    # Fallback to in-memory PLAN_DEFINITIONS if MongoDB collection is empty
    if not plans_list:
        for key, plan in PLAN_DEFINITIONS.items():
            if key == "owner":
                continue
            plans_list.append({
                "id": key,
                "plan_name": plan["label"],
                "credits": plan["credits_granted"],
                "price": plan["price"],
                "features": [f for f in plan["features"] if f in active_features] if active_features else plan["features"],
                "summary": plan["summary"]
            })
            
    return {"status": "success", "data": plans_list}
