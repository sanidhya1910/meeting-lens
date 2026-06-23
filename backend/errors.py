"""Domain errors mapped to HTTP status codes in main.py."""


class MeetingNotFoundError(Exception):
    def __init__(self, meeting_id: str):
        super().__init__(f"Meeting not found: {meeting_id}")
        self.meeting_id = meeting_id


class MeetingNoTranscriptError(Exception):
    def __init__(self, meeting_id: str):
        super().__init__(f"Meeting has no transcript: {meeting_id}")
        self.meeting_id = meeting_id
