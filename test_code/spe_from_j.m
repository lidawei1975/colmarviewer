function y=spe_from_j(x,spe)

a=x(1);
sigma=x(2);
gamma=x(3);
center=x(4);

js=x(5:8);



n=length(spe);
x=1:n;
x=x';


y=zeros(n,1);

c=center+js(4)/2+(js(1)+js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2+(js(1)+js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2+(js(1)-js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2+(js(1)-js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2-(js(1)+js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2-(js(1)+js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2-(js(1)-js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center+js(4)/2-(js(1)-js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);



c=center-js(4)/2+(js(1)+js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2+(js(1)+js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2+(js(1)-js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2+(js(1)-js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2-(js(1)+js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2-(js(1)+js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2-(js(1)-js(2)+js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

c=center-js(4)/2-(js(1)-js(2)-js(3))/2;
y=y+a*voigt(x-c,sigma,gamma)./voigt(0,sigma,gamma);

y=y-spe;


