# Evaluation Results — May 18, 2026

```
Model: google/gemini-2.5-flash-lite
Cases: 11

========================================================================
CASE: Machine learning (beginner)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "concept"
  [OK]   URL grounding          2 URL(s) outside candidates → 2 verified + kept, 0 stripped
  [INFO] coverage               3/3 expected concepts present
  [OK]   forbidden absent       none of 3 forbidden terms appeared
         7869ms, 7,224 tokens

========================================================================
CASE: Machine learning (intermediate)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "concept"
  [OK]   URL grounding          4 URL(s) outside candidates → 2 verified + kept, 0 stripped
  [INFO] coverage               3/3 expected concepts present
  [OK]   forbidden absent       none of 3 forbidden terms appeared
         6682ms, 7,574 tokens

========================================================================
CASE: Machine learning (advanced)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "concept"
  [OK]   URL grounding          1 URL(s) outside candidates → 1 verified + kept, 0 stripped
  [INFO] coverage               3/3 expected concepts present
  [OK]   forbidden absent       none of 3 forbidden terms appeared
         6984ms, 7,684 tokens

========================================================================
CASE: Photosynthesis (beginner)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "concept"
  [OK]   URL grounding          model stayed within candidate set (clean)
  [INFO] coverage               3/3 expected concepts present
  [OK]   forbidden absent       none of 2 forbidden terms appeared
         6438ms, 7,270 tokens

========================================================================
CASE: World War I (beginner)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "event"
  [OK]   URL grounding          model stayed within candidate set (clean)
  [INFO] coverage               3/3 expected concepts present
  [OK]   forbidden absent       none of 2 forbidden terms appeared
         7757ms, 8,769 tokens

========================================================================
CASE: Bill Gates (beginner)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "person"
  [OK]   URL grounding          model stayed within candidate set (clean)
  [INFO] coverage               2/2 expected concepts present
  [OK]   forbidden absent       none of 2 forbidden terms appeared
         7483ms, 8,131 tokens

========================================================================
CASE: Bill Gates (beginner)
========================================================================
  [OK]   schema validity        Zod-validated by generateText + Output.object
  [OK]   graph integrity        all edges valid, exactly one main_topic, counts in range
  [OK]   topic type             inferred "person"
  [OK]   personalization        whyThisPath echoes all 2 goal keyword(s)
  [OK]   URL grounding          model stayed within candidate set (clean)
  [INFO] coverage               1/1 expected concepts present
  [OK]   forbidden absent       none of 1 forbidden terms appeared
         7374ms, 8,173 tokens

========================================================================
CASE: Mercury (beginner) [behavior=ambiguous]
========================================================================
  [OK]   ambiguous regression   DisambiguationError thrown — UI will show chooser
  [OK]   candidate coverage     all 3 expected candidate(s) present (15 total)
         603ms

========================================================================
CASE: ML (beginner) [behavior=ambiguous]
========================================================================
  [OK]   ambiguous regression   DisambiguationError thrown — UI will show chooser
  [OK]   candidate coverage     all 1 expected candidate(s) present (15 total)
         384ms

========================================================================
CASE: qzqzqzqz-not-a-real-topic-12345 (beginner) [behavior=not_found]
========================================================================
[wiki] fetchWikipediaLeadLinks fell back to []: missingtitle (The page you specified doesn't exist.) for "qzqzqzqz-not-a-real-topic-12345"
  [OK]   not_found regression   WikipediaNotFoundError thrown — UI will show 404 card
         65ms

========================================================================
CASE: Photosynthsis (beginner) [behavior=not_found]
========================================================================
[wiki] fetchWikipediaLeadLinks fell back to []: missingtitle (The page you specified doesn't exist.) for "Photosynthsis"
[wiki] fetchWikipediaSeeAlsoLinks fell back to []: missingtitle for "Photosynthsis"
  [OK]   not_found regression   WikipediaNotFoundError thrown — UI will show 404 card
  [OK]   did-you-mean           all 1 expected suggestion(s) present (got: Photosynthesis, Photosynthetic efficiency, Photosynthesis system, Photosynthesis Research, Photosynthesis (board game))
         154ms

========================================================================
CROSS-LEVEL: Machine learning (3 levels)
========================================================================
  [OK]   audience adaptation     max whyThisPath similarity 0.36 (threshold < 0.85)

========================================================================
CROSS-LEVEL: Bill Gates (2 levels)
========================================================================
  [OK]   audience adaptation     max whyThisPath similarity 0.22 (threshold < 0.85)

========================================================================
SUMMARY
========================================================================
Cases:  11/11 passed
Gating: 43/43 checks passed
Info:   7 behavioral signal(s) reported
Time:   51.9s total
Tokens: 54,825 total
[wiki] fetchWikipediaSeeAlsoLinks fell back to []: missingtitle for "qzqzqzqz-not-a-real-topic-12345"
```
