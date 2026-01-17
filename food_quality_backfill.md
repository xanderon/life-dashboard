Da, sigur! Query-ul e foarte safe - actualizeaza DOAR food_quality si DOAR pentru items care:

Au food_quality = NULL (neclasificate)
Exista un item cu acelasi name care ARE food_quality setat

sql-- Dry run mai intai (vezi ce se va schimba)
SELECT 
  ri.id,
  ri.name,
  ri.food_quality AS current_quality,
  source.food_quality AS will_become
FROM receipt_items ri
JOIN (
  SELECT DISTINCT name, food_quality
  FROM receipt_items
  WHERE food_quality IS NOT NULL
    AND owner_id = 'eadc340b-96c4-4994-82b7-79b28b574aca'
) source ON ri.name = source.name
WHERE ri.owner_id = 'eadc340b-96c4-4994-82b7-79b28b574aca'
  AND ri.food_quality IS NULL
ORDER BY ri.name;

asta iti arata ce se va actualiza. Daca e ok, rulezi:

sql-- Update efectiv (DOAR food_quality, nimic altceva)
UPDATE receipt_items ri
SET food_quality = source.food_quality
FROM (
  SELECT DISTINCT name, food_quality
  FROM receipt_items
  WHERE food_quality IS NOT NULL
    AND owner_id = 'eadc340b-96c4-4994-82b7-79b28b574aca'
) source
WHERE ri.name = source.name
  AND ri.owner_id = 'eadc340b-96c4-4994-82b7-79b28b574aca'
  AND ri.food_quality IS NULL;

Ce face:

Gaseste toate produsele unice care DEJA au food_quality setat
Actualizeaza DOAR food_quality la items cu acelasi name care sunt NULL
Nu modifica: is_food, quantity, price, meta, nimic altceva
Nu atinge items care deja au food_quality setat

Verificare dupa:

sql-- Cate items mai raman neclasificate?
SELECT COUNT(*) 
FROM receipt_items 
WHERE owner_id = 'eadc340b-96c4-4994-82b7-79b28b574aca'
  AND food_quality IS NULL;
