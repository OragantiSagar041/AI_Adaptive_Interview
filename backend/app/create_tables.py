from app.database_pg import engine, Base
from app.repositories.conversation_repository import Agent, ConversationSection


def create_tables():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == '__main__':
    create_tables()
