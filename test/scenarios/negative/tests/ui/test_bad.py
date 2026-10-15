# spec: FR-2; cat: Logic
def test_category_in_the_wrong_case():
    pass


def test_untagged_python():
    pass


# spec: FR-1; cat: logic
@pytest.mark.skip
@pytest.mark.parametrize("x", [1])
def test_tag_above_decorators_is_fine(x):
    pass
