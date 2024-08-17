module.exports = (temp, product) => {
	let output = temp.replace(/{%PRODUCTNAME%}/g, product.productName);
	const path = product.image[0];
	const imageElement = `<img src="${path}" alt="${product.productName} Image">`;
	output = output.replace(/{%IMAGE%}/g, imageElement);
	output = output.replace(/{%PRICE%}/g, product.price);
	output = output.replace(/{%DESCRIPTION%}/g, product.description);
	output = output.replace(/{%ID%}/g, product.id);
	output = output.replace(/{%LOCATION%}/g, product.location);
	output = output.replace(/{%DATE%}/g, product.date);
	return output;
};
