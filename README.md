from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from bson import ObjectId
from datetime import datetime, timedelta
import motor.motor_asyncio

app = FastAPI()

# MongoDB connection
client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27017')
db = client.habito

# Predefined badges
BADGES = [
    {
        "name": "5-Day Streak Badge",
        "description": "Earned for maintaining a habit for 5 consecutive days.",
        "requirement": {"streak": 5}
    },
    {
        "name": "10-Day Streak Badge",
        "description": "Earned for maintaining a habit for 10 consecutive days.",
        "requirement": {"streak": 10}
    },
    {
        "name": "Morning Routine Master",
        "description": "Earned for completing all tasks in the Morning Routine challenge.",
        "requirement": {"challenge": "Morning Routine"}
    }
    # Additional badges can be added as needed
]

# Habit Model
class Habit(BaseModel):
    name: str
    user_id: str
    frequency: int  # in days, how often the habit should be repeated
    current_streak: int = 0
    last_completed: Optional[str] = None  # store as string to handle date serialization
    rewards: List[str] = []
    badges: List[str] = []
    challenges: Optional[List[str]] = []

# User Model
class User(BaseModel):
    username: str
    habits: List[str]
    badges: List[str] = []

# Predefined Challenges List
CHALLENGES = {
    "Morning Routine": ["Wake Up Early", "Exercise", "Healthy Breakfast", "Plan Your Day"],
    "Work Routine": ["Focus on Important Tasks", "Take Breaks", "Stay Organized"],
    "Personal Development": ["Read", "Learn Something New", "Reflect"],
    "Evening Routine": ["Unwind", "Prepare for Tomorrow", "Connect with Loved Ones", "Sleep Well"],
    "Health and Wellness": ["Stay Hydrated", "Healthy Eating", "Exercise Regularly"],
    "Mental Health": ["Mindfulness", "Breaks and Relaxation", "Social Connections"]
}

# ----------- Habit Endpoints ---------------

# Create a new habit
@app.post("/habits/")
async def create_habit(habit: Habit):
    habit_dict = habit.dict()
    result = await db.habits.insert_one(habit_dict)
    return {"id": str(result.inserted_id)}

# Complete a habit and track streaks, rewards, badges
@app.post("/habits/{habit_id}/complete")
async def complete_habit(habit_id: str):
    habit = await db.habits.find_one({"_id": ObjectId(habit_id)})
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    last_completed_str = habit.get("last_completed")
    last_completed = datetime.strptime(last_completed_str, "%Y-%m-%d") if last_completed_str else None
    current_date = datetime.now().date()

    # Calculate the new streak
    if last_completed:
        if current_date == last_completed:  # Habit already completed today
            return {"status": "Habit already completed today", "current_streak": habit["current_streak"]}
        elif current_date == last_completed + timedelta(days=habit["frequency"]):
            new_streak = habit.get("current_streak", 0) + 1
        else:
            new_streak = 1
    else:
        new_streak = 1

    # Update the habit's streak and last completed date
    await db.habits.update_one(
        {"_id": ObjectId(habit_id)},
        {
            "$set": {
                "current_streak": new_streak,
                "last_completed": str(current_date),
            }
        }
    )

    # Check for rewards and badges
    rewards = await check_rewards(new_streak, habit)
    badges = await check_badges(new_streak, habit)

    return {
        "status": "Habit completed",
        "current_streak": new_streak,
        "rewards": rewards,
        "badges": badges,
        "last_completed": str(current_date)  # Save completion date
    }

# ----------- Badge and Reward Logic ---------------

# Function to check and award rewards based on streak
async def check_rewards(streak: int, habit: dict) -> List[str]:
    rewards = []

    # Add logic for streak-based rewards
    if streak == 5:
        rewards.append("Reward for 5-day streak!")
    if streak == 10:
        rewards.append("Reward for 10-day streak!")

    return rewards

# Function to check and award badges
async def check_badges(streak: int, habit: dict) -> List[str]:
    badges_awarded = []
    user_id = habit["user_id"]

    # Get user details
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    earned_badges = user.get("badges", [])

    # Check badge conditions
    for badge in BADGES:
        if "streak" in badge["requirement"]:
            if streak >= badge["requirement"]["streak"] and badge["name"] not in earned_badges:
                badges_awarded.append(badge["name"])
                earned_badges.append(badge["name"])
        elif "challenge" in badge["requirement"]:
            challenge_name = badge["requirement"]["challenge"]
            if check_challenge_completion(challenge_name, habit) and badge["name"] not in earned_badges:
                badges_awarded.append(badge["name"])
                earned_badges.append(badge["name"])

    # Update user badges if new badges are earned
    if badges_awarded:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"badges": earned_badges}}
        )

    return badges_awarded

# Check if the user has completed all habits in a challenge
def check_challenge_completion(challenge_name: str, habit: dict) -> bool:
    challenge_habits = CHALLENGES.get(challenge_name, [])
    user_habits = habit.get("challenges", [])

    # Check if the user completed all habits within the challenge
    return set(challenge_habits).issubset(set(user_habits))

# ----------- User Endpoints ---------------

# Fetch user badges
@app.get("/users/{user_id}/badges", response_model=List[str])
async def get_user_badges(user_id: str):
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user.get("badges", [])

# Fetch user progress (habits, streaks, rewards, badges)
@app.get("/users/{user_id}/progress")
async def get_user_progress(user_id: str):
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    habits = await db.habits.find({"user_id": user_id}).to_list(None)
    return {
        "username": user["username"],
        "habits": habits,
        "badges": user.get("badges", []),
    }

# ----------- Challenges ---------------

# Get available challenges
@app.get("/challenges/")
async def get_challenges():
    return CHALLENGES

# Track completion of challenge tasks
@app.post("/habits/{habit_id}/track_challenge")
async def track_challenge(habit_id: str, challenge_name: str):
    habit = await db.habits.find_one({"_id": ObjectId(habit_id)})
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    challenge_habits = CHALLENGES.get(challenge_name, [])
    user_habits = habit.get("challenges", [])

    # Update the habit's challenge progress
    user_habits.append(challenge_name)
    await db.habits.update_one(
        {"_id": ObjectId(habit_id)},
        {"$set": {"challenges": user_habits}}
    )

    return {"status": "Challenge task tracked", "challenge": challenge_name, "progress": user_habits}
