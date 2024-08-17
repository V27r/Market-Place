const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const app = express();
const cookieParser = require('cookie-parser');
const fs = require('fs');
const slugify = require('slugify');
const replaceTemplate = require('./replacetemplate.js');

const port = 5500;

app.use(express.static(__dirname));
app.use(cookieParser());

const tempOverview = fs.readFileSync('template-overview.html', 'utf-8');
const tempCard = fs.readFileSync('template-card.html', 'utf-8');
const tempproduct = fs.readFileSync('template-product.html', 'utf-8');

mongoose
	.connect(
		'mongodb+srv://mahaveer:JgUpv9PIBjga90Sn@cluster0.dfi6lc1.mongodb.net/<your-database>',
		{
			useNewUrlParser: true,
			useUnifiedTopology: true,
		}
	)
	.then(() => {
		console.log('Connected to MongoDB!');
	})
	.catch((err) => {
		console.error('Error connecting to MongoDB:', err);
	});

const userSchema = new mongoose.Schema({
	username: String,
	emailid: { type: String, unique: true },
	dob: Date,
	gender: String,
	password: String,
});

const productSchema = new mongoose.Schema({
	id: Number,
	productName: String,
	image: Buffer,
	price: Number,
	description: String,
	location: String,
	date: { type: Date, default: Date.now },
});

userSchema.pre('save', async function (next) {
	if (!this.isModified('password')) return next();
	this.password = await bcrypt.hash(this.password, 12);
});
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'uploads/');
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const originalname = file.originalname;
		const extension = originalname.split('.').pop();
		cb(null, originalname + '-' + uniqueSuffix + '.' + extension);
	},
});

const upload = multer({ storage: storage });
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Products', productSchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const verifyToken = (req, res, next) => {
	const token = req.cookies.token;
	if (!token) {
		return res.status(401).json({ message: 'Unauthorized' });
	}
	jwt.verify(token, 'this-is-a-very-strong-secret-key', (err, decoded) => {
		if (err) {
			return res.status(401).json({ message: 'Token is not valid' });
		}
		req.user = decoded;
		next();
	});
};

app.get('/login', async (req, res) => {
	res.sendFile(path.join(__dirname, '/login.html'));
});

app.post('/login', async (req, res) => {
	const { emailid, password } = req.body;
	try {
		const user = await User.findOne({ emailid });
		if (!user) {
			return res.status(401).json({ message: 'User not found' });
		}
		const passwordMatch = await bcrypt.compare(password, user.password);
		if (!passwordMatch) {
			return res.status(401).json({ message: 'Invalid password' });
		}
		const token = jwt.sign(
			{ userId: user._id, emailid: user.emailid },
			'this-is-a-very-strong-secret-key',
			{ expiresIn: '1h' }
		);
		res.cookie('token', token);
		return res.status(201).json({ message: 'Login successful' });
	} catch (err) {
		console.error('Error during login:', err);
		return res.status(500).json({ message: 'Login error' });
	}
});

app.get('/register', (req, res) => {
	res.sendFile(__dirname + '/register.html');
});

app.post('/register', async (req, res) => {
	const userData = req.body;
	try {
		const existingUser = await User.findOne({ emailid: userData.emailid });
		if (existingUser) {
			return res.status(400).json({ message: 'Email is already registered' });
		}
		const newUser = new User(userData);
		await newUser.save();
		return res.status(200).json({ message: 'User registered successfully' });
	} catch (err) {
		console.error('Error saving user data:', err);
		return res.status(500).json({ message: 'Error saving user data' });
	}
});
app.get('/logout', (req, res) => {
	res.clearCookie('token');
	res.redirect('/login');
});

app.get('/homepage', verifyToken, (req, res) => {
	try {
		const data = fs.readFileSync('./data.json', 'utf-8');
		const products = JSON.parse(data);
		const cardsHTML = products.map((el) => replaceTemplate(tempCard, el)).join('');
		const output = tempOverview.replace('{%PRODUCT_CARDS%}', cardsHTML);
		res.end(output);
	} catch (error) {
		console.error(error);
		return res.status(500).send('Internal Server Error');
	}
});

app.get('/product', verifyToken, (req, res) => {
	const data = fs.readFileSync('./data.json', 'utf-8');
	const dataobj = JSON.parse(data);
	const productId = req.query.id;
	if (!productId) {
		return res.status(400).json({ message: 'Product ID is required' });
	}
	const productIndex = parseInt(productId, 10);
	if (isNaN(productIndex) || productIndex < 0 || productIndex >= dataobj.length) {
		return res.status(404).json({ message: 'Product not found' });
	}
	const product = dataobj[productIndex];
	const output = replaceTemplate(tempproduct, product);
	return res.status(200).send(output);
});

app.get('/product-register', verifyToken, (req, res) => {
	res.sendFile(__dirname + '/product-register.html');
});

app.post(
	'/product-register',
	verifyToken,
	upload.array('productImages', 5),
	async (req, res) => {
		try {
			const newProductData = req.body;
			const files = req.files;
			const imagePaths = [];
			for (const file of files) {
				imagePaths.push(file.path);
			}
			newProductData.image = imagePaths;
			const existingData = require('./data.json');
			const lastId =
				existingData.length > 0 ? existingData[existingData.length - 1].id : 0;
			newProductData.id = lastId + 1;
			existingData.push(newProductData);
			fs.writeFileSync('./data.json', JSON.stringify(existingData, null, 2));
			delete newProductData.id;
			const newProduct = new Product(newProductData);
			res.status(200).json({ message: 'Product registered and data updated!' });
			await newProduct.save();
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	}
);

app.get('/new-featured', verifyToken, (req, res) => {
	try {
		const data = require('./data.json');
		const reversedData = data.slice().reverse();
		const cardsHTML = reversedData.map((el) => replaceTemplate(tempCard, el)).join('');
		const output = tempOverview.replace('{%PRODUCT_CARDS%}', cardsHTML);
		res.end(output);
	} catch (error) {
		console.error(error);
		return res.status(500).send('Internal Server Error');
	}
});

app.get('/:category', verifyToken, (req, res) => {
	try {
		const { category } = req.params;
		const data = require('./data.json');

		const matchingProducts = data.filter((product) => {
			const productName = product.productName.toLowerCase();
			return productName.includes(category.toLowerCase());
		});

		if (matchingProducts.length > 0) {
			const cardsHTML = matchingProducts
				.map((el) => replaceTemplate(tempCard, el))
				.join('');
			const output = tempOverview.replace('{%PRODUCT_CARDS%}', cardsHTML);
			res.end(output);
		} else {
			res.status(404).send('No products found for the specified category!');
		}
	} catch (error) {
		console.error(error);
		return res.status(500).send('Internal Server Error!');
	}
});

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
