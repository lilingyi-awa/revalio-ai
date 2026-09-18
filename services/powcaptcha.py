import hashlib
from collections import deque
import time
from config import POW_SIGNATURE_KEY
import os
import hmac
import base64
import re
import asyncio

class TemporalSet:
    def __init__(self, expiration: float):
        self.__expiration = expiration
        self.__orderic: deque[tuple[int, float]] = deque()
        self.__lister: set[int] = set()
    def __prune(self, T: int):
        while len(self.__orderic) > 0:
            ta, iss = self.__orderic.popleft()
            if (T - iss) < self.__expiration:
                self.__orderic.appendleft((ta, iss))
                return
            self.__lister.remove(ta)
    def append(self, blacked):
        blacked = hash(blacked)
        T = time.monotonic()
        self.__prune(T)
        self.__lister.add(blacked)
        self.__orderic.appendleft((blacked, T))
    def is_listed(self, blacked):
        blacked = hash(blacked)
        self.__prune(time.monotonic())
        if blacked in self.__lister:
            return True
        return False

used_challgence = TemporalSet(130)

def create_challgence():
    sal = os.urandom(26)
    verr = bytes((i ^ j) for i, j in zip(int(time.time()).to_bytes(8, 'big'), sal[:8])) + sal
    verr += hmac.digest(POW_SIGNATURE_KEY, verr, 'sha256')
    return base64.urlsafe_b64encode(verr).decode('ascii')

async def verify_challgence(challgence: str, salt: str):
    if used_challgence.is_listed(challgence):
        return False
    if not re.match(r"^[a-zA-Z0-9_-]{88}$", challgence):
        return False
    if not re.match(r"^[a-z0-f]{64}$", salt):
        return False
    verr = base64.urlsafe_b64decode(challgence)
    if not hmac.compare_digest(verr[-32:], hmac.digest(POW_SIGNATURE_KEY, verr[:-32], 'sha256')):
        return False
    iss = int.from_bytes(bytes((i ^ j) for i, j in zip(verr[:8], verr[8:16])), 'big')
    T = int(time.time())
    if iss > T or iss < (T - 120):
        return False
    v = await asyncio.to_thread(lambda: hashlib.scrypt(challgence.encode('ascii'), salt=bytes.fromhex(salt), n=256, r=8, p=4, dklen=2))
    used_challgence.append(challgence)
    return (v[0] == 0) and ((v[1] >> 4) < 4)
