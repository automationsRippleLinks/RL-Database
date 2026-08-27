from sqlmodel import select
from app.services.parser import extract_file_id
from app.core.db import Session_Factory
from app.models import Pitch
import asyncio


async def main():
    async with Session_Factory() as session:
        pitch_sheet_urls = (await session.exec(select(Pitch.spreadsheet_link))).all()
        url_ids = list(map(extract_file_id, pitch_sheet_urls))
        for url in pitch_sheet_urls:
            if url_ids.count(extract_file_id(url)) > 1:
                print(url)

if __name__ == "__main__":
    asyncio.run(main())