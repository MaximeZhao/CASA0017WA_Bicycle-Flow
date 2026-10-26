import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_bikes import transform

class CollectorTests(unittest.TestCase):
    def station(self, **properties):
        return {"id": "BikePoints_1", "commonName": "Example", "lat": 51.5, "lon": -0.1,
                "additionalProperties": [{"key": k, "value": v} for k, v in properties.items()]}

    def test_missing_counts_and_status_are_unknown(self):
        h=transform([self.station()], "2026-10-20T08:00:00Z")["stations"][0]["history"][0]
        self.assertIsNone(h["bikes"])
        self.assertIsNone(h["isOperational"])
        self.assertIsNone(h["faults"])

    def test_capacity_difference_is_not_invented_fault_count(self):
        h=transform([self.station(NbBikes="9", NbEmptyDocks="8", NbDocks="19", Installed="true", Locked="false")], "2026-10-20T08:00:00Z")["stations"][0]["history"][0]
        self.assertEqual(h["bikes"],9)
        self.assertTrue(h["isOperational"])
        self.assertIsNone(h["faults"])

    def test_locked_and_uninstalled_are_closed(self):
        for props in ({"Locked":"true"},{"Installed":"false"}):
            h=transform([self.station(**props)], "2026-10-20T08:00:00Z")["stations"][0]["history"][0]
            self.assertFalse(h["isOperational"])

    def test_invalid_and_empty_batch_rejected(self):
        with self.assertRaises(ValueError): transform([],"2026-10-20T08:00:00Z")
        with self.assertRaises(ValueError): transform([self.station(NbBikes="-1")],"2026-10-20T08:00:00Z")
        with self.assertRaises(ValueError): transform([self.station(NbBikes="9",NbEmptyDocks="9",NbDocks="10")],"2026-10-20T08:00:00Z")

if __name__=='__main__': unittest.main()
