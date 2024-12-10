function x=make_x_matrix(m,n)



x1=diag(ones(m-n,1));

x=zeros(m,m-n);
x(1:m-n,1:m-n)=x1;

for i=1+n:m
    x(i,i-n)=1;
end