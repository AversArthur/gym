-- У каждой тренировки должен быть client_id: офлайн-клиент ссылается на тренировку только по нему
UPDATE `workouts` SET `client_id` = 'srv-' || `id` WHERE `client_id` IS NULL;
