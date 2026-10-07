"""Database layer.

Real DB = MongoDB (Motor). Agar Mongo reachable nahi hai to app in-memory store
pe chalta hai taaki dev me turant kaam kare (data restart pe reset hoga).
Dono ka API bilkul same hai, isliye baaki code ko pata bhi nahi chalta.
"""

from __future__ import annotations

import os
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "transport_db")

Collection = dict[str, Any]


def new_id() -> str:
    return uuid.uuid4().hex


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MongoDB:
    kind = "mongodb"

    def __init__(self, db) -> None:
        self.db = db
        self.client = None

    async def connect(self) -> bool:
        client = await self._build_client()
        if client is None:
            return False
        await client.admin.command("ping")
        self.client = client
        self.db = client[DB_NAME]
        return True

    @staticmethod
    async def _build_client():
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
        except ImportError:
            return None
        return AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=1500)

    async def insert_one(self, collection: str, doc: Collection) -> str:
        doc.setdefault("_id", new_id())
        await self.db[collection].insert_one(deepcopy(doc))
        return doc["_id"]

    async def find_one(self, collection: str, flt: Collection | None) -> Collection | None:
        if not flt:
            return await self.db[collection].find_one({})
        return await self.db[collection].find_one(dict(flt))

    async def find_many(
        self,
        collection: str,
        flt: Collection | None = None,
        sort: list[tuple[str, int]] | None = None,
        limit: int | None = None,
        skip: int | None = None,
    ) -> list[Collection]:
        cursor = self.db[collection].find(dict(flt or {}))
        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        if limit:
            cursor = cursor.limit(limit)
        return [doc async for doc in cursor]

    async def update_one(self, collection: str, doc_id: str, patch: Collection) -> bool:
        res = await self.db[collection].update_one({"_id": doc_id}, {"$set": dict(patch)})
        return res.matched_count > 0

    async def delete_one(self, collection: str, doc_id: str) -> bool:
        res = await self.db[collection].delete_one({"_id": doc_id})
        return res.deleted_count > 0

    async def count(self, collection: str, flt: Collection | None = None) -> int:
        return await self.db[collection].count_documents(dict(flt or {}))


class MemoryDB:
    kind = "memory"
    _data: dict[str, list[Collection]] = {}

    def __init__(self) -> None:
        self._data = {}

    async def connect(self) -> bool:
        return True

    async def insert_one(self, collection: str, doc: Collection) -> str:
        doc.setdefault("_id", new_id())
        self._data.setdefault(collection, []).append(deepcopy(doc))
        return doc["_id"]

    async def find_one(self, collection: str, flt: Collection | None) -> Collection | None:
        for doc in self._data.get(collection, []):
            if _matches(doc, flt):
                return deepcopy(doc)
        return None

    async def find_many(
        self,
        collection: str,
        flt: Collection | None = None,
        sort: list[tuple[str, int]] | None = None,
        limit: int | None = None,
        skip: int | None = None,
    ) -> list[Collection]:
        items = [deepcopy(d) for d in self._data.get(collection, []) if _matches(d, flt)]
        for field, direction in reversed(sort or []):
            items.sort(key=lambda d: (d.get(field) is None, d.get(field)), reverse=direction < 0)
        if skip:
            items = items[skip:]
        if limit:
            items = items[:limit]
        return items

    async def update_one(self, collection: str, doc_id: str, patch: Collection) -> bool:
        for doc in self._data.get(collection, []):
            if doc["_id"] == doc_id:
                doc.update(patch)
                return True
        return False

    async def delete_one(self, collection: str, doc_id: str) -> bool:
        items = self._data.get(collection, [])
        for index, doc in enumerate(items):
            if doc["_id"] == doc_id:
                items.pop(index)
                return True
        return False

    async def count(self, collection: str, flt: Collection | None = None) -> int:
        return len([d for d in self._data.get(collection, []) if _matches(d, flt)])


def _matches(doc: Collection, flt: Collection | None) -> bool:
    for key, value in (flt or {}).items():
        actual = doc.get(key)
        if isinstance(value, dict):
            for op, operand in value.items():
                if op == "$in" and actual not in operand:
                    return False
                if op == "$ne" and actual == operand:
                    return False
                if op == "$gte" and (actual is None or actual < operand):
                    return False
                if op == "$lte" and (actual is None or actual > operand):
                    return False
        elif actual != value:
            return False
    return True


class Store:
    """Stable handle jo har module import karta hai.

    init_db() pe active backend badal sakta hai, isliye `db` object ko kabhi
    rebind nahi karna - ye har call active backend tak forward karta hai.
    """

    def __init__(self) -> None:
        self._active: MongoDB | MemoryDB = MemoryDB()

    @property
    def kind(self) -> str:
        return self._active.kind

    def _use(self, backend: MongoDB | MemoryDB) -> None:
        self._active = backend

    def __getattr__(self, name: str):
        return getattr(self._active, name)


db = Store()


async def init_db() -> str:
    """Mongo try karo, nahi chala to memory store pe utaro."""
    mongo = MongoDB(None)
    try:
        if await mongo.connect():
            db._use(mongo)
            return "mongodb"
    except Exception:
        pass
    db._use(MemoryDB())
    return "memory"