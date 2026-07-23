import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import MagicMock


MODULE_PATH = Path(__file__).parents[1] / "app" / "answer_service.py"


def load_answer_service(*, interview=None, queue_error=None):
    answers = MagicMock()
    interviews = MagicMock()
    interviews.find_one.return_value = interview

    mongo_module = types.ModuleType("mongo_db")
    mongo_module.answers_collection = answers
    mongo_module.interviews_collection = interviews

    score_task = MagicMock()
    if queue_error:
        score_task.delay.side_effect = queue_error
    tasks = types.SimpleNamespace(score_answer_task=score_task)
    app_module = types.ModuleType("app")
    app_module.tasks = tasks

    sys.modules["mongo_db"] = mongo_module
    sys.modules["app"] = app_module
    spec = importlib.util.spec_from_file_location("answer_service_under_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, answers, interviews, score_task


class AnswerServiceTests(unittest.TestCase):
    def test_persists_normalized_answer_before_enqueuing_scoring(self):
        service, answers, interviews, score_task = load_answer_service(
            interview={"source": "Resume", "profile_text": "Python", "language": "Telugu"}
        )
        answers.find_one.return_value = None

        result = service.persist_answer_and_enqueue_scoring(
            interview_id=" interview-1 ",
            question_id=7,
            question_text=" Why this role? ",
            answer_text=" Because it fits. ",
            candidate_name=" Candidate ",
            time_spent_seconds="-5",
            time_limit_seconds="999999",
        )

        self.assertEqual(result["status"], "saved")
        self.assertEqual(result["scoring_status"], "pending")
        interviews.find_one.assert_called_once()
        upsert = answers.update_one.call_args_list[-1]
        self.assertEqual(upsert.args[0]["question_id"], "7")
        document = upsert.args[1]["$set"]
        self.assertEqual(document["answer_text"], "Because it fits.")
        self.assertEqual(document["time_spent_seconds"], 0)
        self.assertEqual(document["time_limit_seconds"], 24 * 60 * 60)
        self.assertTrue(upsert.kwargs["upsert"])
        self.assertEqual(score_task.delay.call_args.kwargs["language"], "Telugu")
        self.assertEqual(
            score_task.delay.call_args.kwargs["answer_version"],
            result["answer_version"],
        )

    def test_keeps_saved_answer_when_queue_is_temporarily_unavailable(self):
        service, answers, _, _ = load_answer_service(
            queue_error=RuntimeError("broker unavailable")
        )
        answers.find_one.return_value = None

        result = service.persist_answer_and_enqueue_scoring(
            interview_id="interview-1",
            question_id="q-1",
            question_text="Question",
            answer_text="Answer",
        )

        self.assertEqual(result["scoring_status"], "queue_failed")
        self.assertEqual(answers.update_one.call_count, 2)
        delayed_update = answers.update_one.call_args_list[-1].args[1]["$set"]
        self.assertEqual(delayed_update["scoring_status"], "queue_failed")
        self.assertIn("retry automatically", delayed_update["ai_feedback"])

    def test_migrates_a_legacy_numeric_question_id_before_upsert(self):
        service, answers, _, _ = load_answer_service()
        answers.find_one.side_effect = [{"_id": "legacy-id"}, None]

        service.persist_answer_and_enqueue_scoring(
            interview_id="interview-1",
            question_id="12",
            question_text="Question",
            answer_text="Answer",
        )

        migration = answers.update_one.call_args_list[0]
        self.assertEqual(migration.args[0], {"_id": "legacy-id"})
        self.assertEqual(migration.args[1]["$set"]["question_id"], "12")

    def test_rejects_missing_or_oversized_answer_content(self):
        service, _, _, _ = load_answer_service()
        with self.assertRaisesRegex(ValueError, "answer_text is required"):
            service.persist_answer_and_enqueue_scoring(
                interview_id="interview-1",
                question_id="q-1",
                question_text="Question",
                answer_text=" ",
            )
        with self.assertRaisesRegex(ValueError, "character limit"):
            service.persist_answer_and_enqueue_scoring(
                interview_id="interview-1",
                question_id="q-1",
                question_text="Question",
                answer_text="x" * (service.MAX_ANSWER_TEXT_LENGTH + 1),
            )


if __name__ == "__main__":
    unittest.main()
