CREATE TABLE IF NOT EXISTS user_credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('farmer','consumer') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(100) NOT NULL,
      quantity INT NOT NULL,
      location VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      farmer_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cart (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      crop_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES user_credentials(id) ON DELETE CASCADE,
      CONSTRAINT fk_cart_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES user_credentials(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      crop_id INT NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      delivery_status ENUM('pending', 'delivered') NOT NULL DEFAULT 'pending',
      CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_oi_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crop_ratings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      crop_id INT NOT NULL,
      rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_crop (user_id, crop_id),
      CONSTRAINT fk_rating_user FOREIGN KEY (user_id) REFERENCES user_credentials(id) ON DELETE CASCADE,
      CONSTRAINT fk_rating_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;