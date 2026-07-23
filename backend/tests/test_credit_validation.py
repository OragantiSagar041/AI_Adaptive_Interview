import pytest
from pydantic import ValidationError

from app.models import AddCreditsRequest, CreditRequestCreate


@pytest.mark.parametrize("amount", [0, -1, -500])
def test_credit_requests_reject_non_positive_amounts(amount):
    with pytest.raises(ValidationError):
        CreditRequestCreate(amount=amount)


@pytest.mark.parametrize("credits", [0, -1, -500])
def test_credit_transfers_reject_non_positive_amounts(credits):
    with pytest.raises(ValidationError):
        AddCreditsRequest(credits=credits)


def test_credit_values_have_a_production_safety_cap():
    with pytest.raises(ValidationError):
        CreditRequestCreate(amount=1_000_001)
    with pytest.raises(ValidationError):
        AddCreditsRequest(credits=1_000_001)
